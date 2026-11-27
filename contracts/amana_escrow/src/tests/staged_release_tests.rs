/// Issue #289 — Staged releases: multiple release tranches per trade
#[cfg(test)]
#[allow(clippy::module_inception)]
mod staged_release_tests {
    use crate::test_fixture::admin_address;
    use crate::{EscrowContract, EscrowContractClient, TradeStatus};
    use soroban_sdk::{Address, Env, Vec, testutils::Address as _, token};

    fn setup(env: &Env, amount: i128) -> (Address, Address, Address, Address, Address) {
        let admin = admin_address(env);
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let treasury = Address::generate(env);
        let contract_id = env.register(EscrowContract, ());
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_id).mint(&buyer, &amount);
        EscrowContractClient::new(env, &contract_id)
            .initialize(&admin, &token_id, &treasury, &0u32, &token_id);
        (contract_id, token_id, buyer, seller, treasury)
    }

    #[test]
    fn staged_release_feature_flag_blocks_creation_when_disabled() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _token_id, buyer, seller, _treasury) = setup(&env, 10_000);
        let client = EscrowContractClient::new(&env, &contract_id);

        assert!(!client.is_staged_release_enabled());

        let mut tranches = Vec::new(&env);
        tranches.push_back(5_000i128);
        tranches.push_back(5_000i128);

        let res = client.try_create_staged_trade(
            &buyer,
            &seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
            &tranches,
        );
        assert!(res.is_err(), "create_staged_trade must fail when feature flag is disabled");
    }

    #[test]
    fn admin_can_enable_and_disable_staged_release() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _token_id, _buyer, _seller, _treasury) = setup(&env, 10_000);
        let client = EscrowContractClient::new(&env, &contract_id);

        assert!(!client.is_staged_release_enabled());
        client.set_staged_release_enabled(&true);
        assert!(client.is_staged_release_enabled());
        client.set_staged_release_enabled(&false);
        assert!(!client.is_staged_release_enabled());
    }

    #[test]
    fn staged_trade_requires_tranches_sum_to_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _token_id, buyer, seller, _treasury) = setup(&env, 10_000);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.set_staged_release_enabled(&true);

        let mut tranches = Vec::new(&env);
        tranches.push_back(4_000i128);
        tranches.push_back(5_000i128); // sum 9000 != 10000

        let res = client.try_create_staged_trade(
            &buyer,
            &seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
            &tranches,
        );
        assert!(res.is_err(), "create_staged_trade must fail when tranches do not sum to trade amount");
    }

    #[test]
    fn staged_trade_releases_in_agreed_tranches_and_stream_accounting() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _token_id, buyer, seller, _treasury) = setup(&env, 10_000);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.set_staged_release_enabled(&true);

        let mut tranches = Vec::new(&env);
        tranches.push_back(5_000i128);
        tranches.push_back(5_000i128);

        let trade_id = client.create_staged_trade(
            &buyer,
            &seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
            &tranches,
        );

        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Created));

        client.deposit(&trade_id);
        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Funded));

        // Initial stream accounting
        let (orig, claimed, clawback) = client.get_stream_accounting(&trade_id);
        assert_eq!(orig, 10_000);
        assert_eq!(claimed, 0);
        assert_eq!(clawback, 0);

        client.confirm_delivery(&trade_id);
        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Delivered));

        // First tranche release (50%)
        client.release_funds(&trade_id, &buyer);
        let trade = client.get_trade(&trade_id);
        // Trade should still be in Delivered status for the remaining tranche
        assert!(matches!(trade.status, TradeStatus::Delivered));

        // Intermediate stream accounting
        assert_eq!(client.get_claimed_amount(&trade_id), 5_000);
        let (orig, claimed, clawback) = client.get_stream_accounting(&trade_id);
        assert_eq!(orig, 10_000);
        assert_eq!(claimed, 5_000);
        assert_eq!(clawback, 0);

        // Second tranche release (remaining 50%) via release_tranche
        client.release_tranche(&trade_id, &buyer);
        let trade = client.get_trade(&trade_id);
        // Now trade is completed
        assert!(matches!(trade.status, TradeStatus::Completed));

        // Final stream accounting
        assert_eq!(client.get_claimed_amount(&trade_id), 10_000);
        let (orig, claimed, clawback) = client.get_stream_accounting(&trade_id);
        assert_eq!(orig, 10_000);
        assert_eq!(claimed, 10_000);
        assert_eq!(clawback, 0);
    }

    #[test]
    fn single_release_trades_behave_exactly_as_before() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _token_id, buyer, seller, _treasury) = setup(&env, 10_000);
        let client = EscrowContractClient::new(&env, &contract_id);

        let trade_id = client.create_trade(&buyer, &seller, &10_000i128, &5000u32, &5000u32, &None);
        client.deposit(&trade_id);
        client.confirm_delivery(&trade_id);

        // Single release releases full amount in one call
        client.release_funds(&trade_id, &buyer);
        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Completed));
        assert_eq!(client.get_claimed_amount(&trade_id), 10_000);
    }
}

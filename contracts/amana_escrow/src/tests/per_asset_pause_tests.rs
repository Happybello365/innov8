/// Issue #290 — Per-asset pausable circuit breaker tests
#[cfg(test)]
#[allow(clippy::module_inception)]
mod per_asset_pause_tests {
    use crate::test_fixture::admin_address;
    use crate::{EscrowContract, EscrowContractClient, TradeStatus};
    use soroban_sdk::{Address, Env, testutils::Address as _, token};

    fn setup(env: &Env) -> (Address, Address, Address, Address, Address, Address, Address) {
        let admin = admin_address(env);
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let guardian = Address::generate(env);
        let treasury = Address::generate(env);
        let contract_id = env.register(EscrowContract, ());

        let cngn_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let usdc_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        token::StellarAssetClient::new(env, &cngn_id).mint(&buyer, &100_000);
        token::StellarAssetClient::new(env, &usdc_id).mint(&buyer, &100_000);

        let client = EscrowContractClient::new(env, &contract_id);
        client.initialize(&admin, &cngn_id, &treasury, &0u32, &cngn_id);
        client.add_guardian(&guardian);
        client.allow_asset(&usdc_id, &6u32);

        (contract_id, cngn_id, usdc_id, buyer, seller, guardian, admin)
    }

    #[test]
    fn non_guardian_cannot_pause_or_unpause_asset() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _cngn_id, usdc_id, _buyer, _seller, _guardian, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let stranger = Address::generate(&env);

        let res = client.try_pause_asset(&stranger, &usdc_id);
        assert!(res.is_err(), "non-guardian must not be able to pause asset");

        let res2 = client.try_unpause_asset(&stranger, &usdc_id);
        assert!(res2.is_err(), "non-guardian must not be able to unpause asset");
    }

    #[test]
    fn pausing_one_asset_blocks_new_trades_in_that_asset_while_leaving_others_tradeable() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, cngn_id, usdc_id, buyer, seller, guardian, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        assert!(!client.is_asset_paused(&usdc_id));
        assert!(!client.is_asset_paused(&cngn_id));

        // Guardian pauses USDC
        client.pause_asset(&guardian, &usdc_id);
        assert!(client.is_asset_paused(&usdc_id));
        assert!(!client.is_asset_paused(&cngn_id));

        // Creating trade in USDC must fail
        let res = client.try_create_trade_with_asset(
            &buyer,
            &seller,
            &usdc_id,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        assert!(res.is_err(), "creating trade in paused asset must fail");

        // Creating trade in cNGN must succeed
        let trade_id = client.create_trade(
            &buyer,
            &seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Created));
    }

    #[test]
    fn unpausing_asset_restores_trading() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _cngn_id, usdc_id, buyer, seller, guardian, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.pause_asset(&guardian, &usdc_id);
        assert!(client.is_asset_paused(&usdc_id));

        client.unpause_asset(&guardian, &usdc_id);
        assert!(!client.is_asset_paused(&usdc_id));

        let trade_id = client.create_trade_with_asset(
            &buyer,
            &seller,
            &usdc_id,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Created));
    }

    #[test]
    fn global_pause_still_stops_all_trading() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, cngn_id, usdc_id, buyer, seller, guardian, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Assets themselves are not paused
        assert!(!client.is_asset_paused(&usdc_id));
        assert!(!client.is_asset_paused(&cngn_id));

        // Global pause invoked
        client.pause(&guardian);
        assert!(client.is_paused());

        // Both cNGN trade and USDC trade must fail under global pause
        let res_cngn = client.try_create_trade(
            &buyer,
            &seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        assert!(res_cngn.is_err(), "global pause must stop cNGN trading");

        let res_usdc = client.try_create_trade_with_asset(
            &buyer,
            &seller,
            &usdc_id,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        assert!(res_usdc.is_err(), "global pause must stop USDC trading");
    }

    #[test]
    fn deposit_blocked_when_asset_is_paused() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _cngn_id, usdc_id, buyer, seller, guardian, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let trade_id = client.create_trade_with_asset(
            &buyer,
            &seller,
            &usdc_id,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );

        // Pause the asset before deposit
        client.pause_asset(&guardian, &usdc_id);

        let res = client.try_deposit(&trade_id);
        assert!(res.is_err(), "deposit must fail when asset is paused");

        // Unpause restores deposit ability
        client.unpause_asset(&guardian, &usdc_id);
        client.deposit(&trade_id);
        let trade = client.get_trade(&trade_id);
        assert!(matches!(trade.status, TradeStatus::Funded));
    }
}

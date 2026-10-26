/// Issue #393 — Migration rehearsal tests for token-bound trades
///
/// Proves that:
///   1. Trades created before a new deployment retain their original token
///      settlement path after the contract is re-initialised (simulated migration).
///   2. The token field on an existing trade cannot be mutated in-place after
///      initialize has been called.
///   3. Attempting to call initialize a second time is rejected, preventing
///      accidental token switching on a live deployment.
///   4. A trade funded against token-A is settled against token-A even when
///      the contract's cNGN pointer would theoretically change.
#[cfg(test)]
#[allow(clippy::module_inception)]
mod migration_tests {
    use crate::{EscrowContract, EscrowContractClient, TradeStatus};
    use soroban_sdk::{Address, Env, String, testutils::Address as _, token};

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Minimal setup: returns (contract_id, token_id, buyer, seller, treasury, admin).
    fn deploy(
        env: &Env,
        amount: i128,
        fee_bps: u32,
    ) -> (Address, Address, Address, Address, Address, Address) {
        let admin = Address::generate(env);
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let treasury = Address::generate(env);
        let contract_id = env.register(EscrowContract, ());
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_id).mint(&buyer, &amount);
        EscrowContractClient::new(env, &contract_id)
            .initialize(&admin, &token_id, &treasury, &fee_bps, &token_id);
        (contract_id, token_id, buyer, seller, treasury, admin)
    }

    // -----------------------------------------------------------------------
    // #393-1  initialize cannot be called twice (no in-place token switching)
    // -----------------------------------------------------------------------
    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_initialize_rejects_second_call() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _, _, _, _, admin) = deploy(&env, 10_000, 100);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Attempt to re-initialise with a different token — must panic
        let new_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let new_treasury = Address::generate(&env);
        client.initialize(&admin, &new_token, &new_treasury, &50_u32, &new_token);
    }

    // -----------------------------------------------------------------------
    // #393-2  Old trade retains original token after simulated migration
    //
    //   Scenario:
    //     - Deploy contract with token-A, create + fund a trade.
    //     - Simulate migration: deploy a *new* contract instance with token-B.
    //     - Confirm the old trade's `token` field still points to token-A.
    //     - Settle the old trade — funds flow through token-A, not token-B.
    // -----------------------------------------------------------------------
    #[test]
    fn test_old_trade_retains_original_token_after_migration() {
        let env = Env::default();
        env.mock_all_auths();

        // ── Old deployment (token-A) ────────────────────────────────────────
        let (old_contract, token_a, buyer, seller, _treasury_a, admin_a) =
            deploy(&env, 10_000, 100);
        let old_client = EscrowContractClient::new(&env, &old_contract);

        let trade_id =
            old_client.create_trade(&buyer, &seller, &10_000_i128, &5000_u32, &5000_u32, &None);
        old_client.deposit(&trade_id);

        // Verify trade is bound to token-A
        let trade_before = old_client.get_trade(&trade_id);
        assert_eq!(
            trade_before.token, token_a,
            "trade must be bound to token-A before migration"
        );

        // ── Simulated migration: new contract with token-B ──────────────────
        let admin_b = Address::generate(&env);
        let token_b = env
            .register_stellar_asset_contract_v2(admin_b.clone())
            .address();
        let new_contract = env.register(EscrowContract, ());
        let treasury_b = Address::generate(&env);
        EscrowContractClient::new(&env, &new_contract).initialize(
            &admin_b,
            &token_b,
            &treasury_b,
            &100_u32,
            &token_b,
        );

        // ── Old trade is unaffected by the new deployment ───────────────────
        let trade_after = old_client.get_trade(&trade_id);
        assert_eq!(
            trade_after.token, token_a,
            "old trade token must still be token-A after new deployment"
        );
        assert_ne!(
            trade_after.token, token_b,
            "old trade must NOT reference token-B"
        );

        // ── Settle old trade — token-A balances must change ─────────────────
        old_client.confirm_delivery(&trade_id);
        old_client.release_funds(&trade_id, &buyer);

        let tok_a = token::Client::new(&env, &token_a);
        let tok_b = token::Client::new(&env, &token_b);

        // Seller received token-A (minus 1% fee); fee is accrued in contract
        assert_eq!(tok_a.balance(&seller), 9_900, "seller must receive token-A");
        assert_eq!(
            old_client.get_accrued_fees(),
            100,
            "treasury must receive token-A fee"
        );

        // token-B balances are untouched
        assert_eq!(tok_b.balance(&seller), 0, "seller must have zero token-B");
        assert_eq!(
            tok_b.balance(&treasury_b),
            0,
            "treasury-B must have zero token-B"
        );

        assert!(matches!(
            old_client.get_trade(&trade_id).status,
            TradeStatus::Completed
        ));

        let _ = (admin_a, admin_b); // suppress unused warnings
    }

    // -----------------------------------------------------------------------
    // #393-3  Dispute on old trade settles via original token
    // -----------------------------------------------------------------------
    #[test]
    fn test_dispute_on_old_trade_settles_via_original_token() {
        let env = Env::default();
        env.mock_all_auths();

        let (old_contract, token_a, buyer, seller, _treasury_a, _admin_a) =
            deploy(&env, 10_000, 100);
        let old_client = EscrowContractClient::new(&env, &old_contract);
        let mediator = Address::generate(&env);
        old_client.set_mediator(&mediator);

        let trade_id =
            old_client.create_trade(&buyer, &seller, &10_000_i128, &5000_u32, &5000_u32, &None);
        old_client.deposit(&trade_id);
        old_client.initiate_dispute(
            &trade_id,
            &buyer,
            &String::from_str(&env, "QmMigrationDisputeReason"),
        );

        // Simulate new deployment (different token) — old trade unaffected
        let admin_b = Address::generate(&env);
        let token_b = env
            .register_stellar_asset_contract_v2(admin_b.clone())
            .address();
        let new_contract = env.register(EscrowContract, ());
        EscrowContractClient::new(&env, &new_contract).initialize(
            &admin_b,
            &token_b,
            &Address::generate(&env),
            &100_u32,
            &token_b,
        );

        // Resolve old dispute — must use token-A
        old_client.resolve_dispute(&trade_id, &mediator, &5_000_u32);

        let tok_a = token::Client::new(&env, &token_a);
        let tok_b = token::Client::new(&env, &token_b);

        // Funds distributed in token-A; fee accrued in contract
        assert!(tok_a.balance(&seller) > 0, "seller must receive token-A");
        assert!(
            old_client.get_accrued_fees() > 0,
            "treasury must receive token-A fee"
        );
        assert_eq!(tok_b.balance(&seller), 0, "seller must have zero token-B");

        assert!(matches!(
            old_client.get_trade(&trade_id).status,
            TradeStatus::Completed
        ));
    }

    // -----------------------------------------------------------------------
    // #393-4  Multiple pre-migration trades all settle via their original token
    // -----------------------------------------------------------------------
    #[test]
    fn test_multiple_pre_migration_trades_settle_via_original_token() {
        let env = Env::default();
        env.mock_all_auths();

        let (old_contract, token_a, buyer, seller, _treasury, _admin) = deploy(&env, 50_000, 0); // zero fee for simpler assertions
        let old_client = EscrowContractClient::new(&env, &old_contract);

        // Create 3 trades before migration
        let amount = 10_000_i128;
        let t1 = old_client.create_trade(&buyer, &seller, &amount, &5000_u32, &5000_u32, &None);
        let t2 = old_client.create_trade(&buyer, &seller, &amount, &3000_u32, &7000_u32, &None);
        let t3 = old_client.create_trade(&buyer, &seller, &amount, &7000_u32, &3000_u32, &None);

        old_client.deposit(&t1);
        old_client.deposit(&t2);
        old_client.deposit(&t3);

        // Simulate migration
        let admin_b = Address::generate(&env);
        let token_b = env
            .register_stellar_asset_contract_v2(admin_b.clone())
            .address();
        let new_contract = env.register(EscrowContract, ());
        EscrowContractClient::new(&env, &new_contract).initialize(
            &admin_b,
            &token_b,
            &Address::generate(&env),
            &100_u32,
            &token_b,
        );

        // All three old trades still reference token-A
        for tid in [t1, t2, t3] {
            assert_eq!(
                old_client.get_trade(&tid).token,
                token_a,
                "trade {tid} must still reference token-A after migration"
            );
        }

        // Settle all three via the happy path
        old_client.confirm_delivery(&t1);
        old_client.release_funds(&t1, &buyer);
        old_client.confirm_delivery(&t2);
        old_client.release_funds(&t2, &buyer);
        old_client.confirm_delivery(&t3);
        old_client.release_funds(&t3, &buyer);

        let tok_b = token::Client::new(&env, &token_b);
        // token-B must be completely untouched
        assert_eq!(tok_b.balance(&seller), 0, "seller must have zero token-B");
        assert_eq!(tok_b.balance(&buyer), 0, "buyer must have zero token-B");
    }

    // -----------------------------------------------------------------------
    // #393-5  Token field on a stored trade is immutable (read-only after creation)
    // -----------------------------------------------------------------------
    #[test]
    fn test_trade_token_field_is_immutable_after_creation() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, token_a, buyer, seller, _, _) = deploy(&env, 10_000, 100);
        let client = EscrowContractClient::new(&env, &contract_id);

        let trade_id =
            client.create_trade(&buyer, &seller, &10_000_i128, &5000_u32, &5000_u32, &None);

        let token_at_creation = client.get_trade(&trade_id).token.clone();

        // Advance through the lifecycle — token must never change
        client.deposit(&trade_id);
        assert_eq!(
            client.get_trade(&trade_id).token,
            token_at_creation,
            "token must be unchanged after deposit"
        );

        client.confirm_delivery(&trade_id);
        assert_eq!(
            client.get_trade(&trade_id).token,
            token_at_creation,
            "token must be unchanged after confirm_delivery"
        );

        client.release_funds(&trade_id, &buyer);
        assert_eq!(
            client.get_trade(&trade_id).token,
            token_at_creation,
            "token must be unchanged after release_funds"
        );

        assert_eq!(token_at_creation, token_a);
    }

    // -----------------------------------------------------------------------
    // Two consecutive schema version upgrades (N -> N+1 -> N+2)
    //
    // The contract only records `SchemaVersion`; it ships no migration of its
    // own yet. These tests model the documented upgrade procedure from
    // docs/upgrade-considerations.md: each migration step is gated on the
    // stored version, rewrites every persisted trade through the `TradeData`
    // envelope and then advances `SchemaVersion`.
    // -----------------------------------------------------------------------

    use crate::{CURRENT_SCHEMA_VERSION, DataKey, TradeData};

    /// Run one migration step on `contract_id`, moving `from` -> `to`.
    fn migrate(env: &Env, contract_id: &Address, trade_ids: &[u64], from: u32, to: u32) {
        env.as_contract(contract_id, || {
            let stored: u32 = env
                .storage()
                .instance()
                .get(&DataKey::SchemaVersion)
                .unwrap_or(CURRENT_SCHEMA_VERSION);
            assert_eq!(stored, from, "migration expects schema version {from}");

            for trade_id in trade_ids {
                let key = DataKey::Trade(*trade_id);
                let data: TradeData = env.storage().persistent().get(&key).unwrap();
                env.storage().persistent().set(&key, &data);
            }
            env.storage().instance().set(&DataKey::SchemaVersion, &to);
        });
    }

    /// Two escrow contracts that share one token and the same parties, so a
    /// trade created in each at the same ledger is directly comparable.
    fn deploy_pair(env: &Env) -> (Address, Address, Address, Address, Address) {
        let admin = Address::generate(env);
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let treasury = Address::generate(env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_id).mint(&buyer, &20_000_i128);

        let stepwise = env.register(EscrowContract, ());
        let single_step = env.register(EscrowContract, ());
        for contract_id in [&stepwise, &single_step] {
            EscrowContractClient::new(env, contract_id)
                .initialize(&admin, &token_id, &treasury, &100_u32, &token_id);
        }
        (stepwise, single_step, token_id, buyer, seller)
    }

    #[test]
    fn test_trade_survives_two_consecutive_migrations() {
        let env = Env::default();
        env.mock_all_auths();
        let (stepwise, single_step, token_id, buyer, seller) = deploy_pair(&env);
        let step_client = EscrowContractClient::new(&env, &stepwise);
        let single_client = EscrowContractClient::new(&env, &single_step);

        // Equivalent funded trades created at the original schema version.
        let step_trade =
            step_client.create_trade(&buyer, &seller, &10_000_i128, &5000_u32, &5000_u32, &None);
        let single_trade =
            single_client.create_trade(&buyer, &seller, &10_000_i128, &5000_u32, &5000_u32, &None);
        step_client.deposit(&step_trade);
        single_client.deposit(&single_trade);
        assert_eq!(step_trade, single_trade, "equivalent starting data");
        assert_eq!(step_client.get_schema_version(), CURRENT_SCHEMA_VERSION);

        let before = step_client.get_trade(&step_trade);

        // Two migrations in sequence on one contract...
        let n = CURRENT_SCHEMA_VERSION;
        migrate(&env, &stepwise, &[step_trade], n, n + 1);
        assert_eq!(step_client.get_schema_version(), n + 1);
        assert_eq!(
            step_client.get_trade(&step_trade),
            before,
            "trade must be intact after the first migration"
        );
        migrate(&env, &stepwise, &[step_trade], n + 1, n + 2);

        // ...versus a single step straight to N+2 on the other.
        migrate(&env, &single_step, &[single_trade], n, n + 2);

        assert_eq!(step_client.get_schema_version(), n + 2);
        assert_eq!(single_client.get_schema_version(), n + 2);
        assert_eq!(
            step_client.get_trade(&step_trade),
            before,
            "trade must be unchanged after two migrations"
        );
        assert_eq!(
            step_client.get_trade(&step_trade),
            single_client.get_trade(&single_trade),
            "two-step migration must match the single-step result"
        );

        let raw = |contract_id: &Address, trade_id: u64| -> TradeData {
            env.as_contract(contract_id, || {
                env.storage()
                    .persistent()
                    .get(&DataKey::Trade(trade_id))
                    .unwrap()
            })
        };
        assert_eq!(
            raw(&stepwise, step_trade),
            raw(&single_step, single_trade),
            "stored envelopes must match"
        );

        // The migrated trade still settles through its original token.
        step_client.confirm_delivery(&step_trade);
        step_client.release_funds(&step_trade, &buyer);
        assert!(matches!(
            step_client.get_trade(&step_trade).status,
            TradeStatus::Completed
        ));
        assert_eq!(token::Client::new(&env, &token_id).balance(&seller), 9_900);
    }

    #[test]
    #[should_panic(expected = "migration expects schema version")]
    fn test_second_migration_cannot_skip_the_first() {
        let env = Env::default();
        env.mock_all_auths();
        let (stepwise, _single_step, _token_id, buyer, seller) = deploy_pair(&env);
        let client = EscrowContractClient::new(&env, &stepwise);
        let trade_id =
            client.create_trade(&buyer, &seller, &10_000_i128, &5000_u32, &5000_u32, &None);

        let n = CURRENT_SCHEMA_VERSION;
        migrate(&env, &stepwise, &[trade_id], n + 1, n + 2);
    }
}

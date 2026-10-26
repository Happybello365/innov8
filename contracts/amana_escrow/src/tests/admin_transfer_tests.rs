/// Issue #1 — Two-step admin transfer (propose_admin / accept_admin)
///
/// Test coverage:
///   1. Happy path — propose then accept; get_admin() returns new admin,
///      PendingAdmin is cleared, both events are emitted.
///   2. Wrong acceptor — a stranger calling accept_admin is rejected.
///   3. Overwrite pending proposal — proposing twice replaces the first
///      pending address; the original pending address can no longer accept.
///   4. No pending transfer — accept_admin panics when nothing is pending.
///   5. Non-admin cannot propose — stranger cannot call propose_admin.
///   6. Event shape — `propose_admin` / `accept_admin` emit the topics and
///      payload documented in `docs/event-schema.md` (Issue #285).
#[cfg(test)]
#[allow(clippy::module_inception)]
mod admin_transfer_tests {
    extern crate std;

    use crate::{EscrowContract, EscrowContractClient};
    use crate::test_fixture::admin_address;
    use crate::generated::event_schema;
    use crate::{AdminTransferAcceptedEvent, AdminTransferProposedEvent};
    use soroban_sdk::{
        testutils::{Address as _, Events as _},
        xdr::{ContractEvent, ContractEventBody, ScVal},
        Address, Env, Event, IntoVal, Symbol, TryFromVal, Val,
    };

    /// Spin up a minimal initialized contract, returning
    /// (contract_id, admin_address).
    fn setup(env: &Env) -> (Address, Address) {
        let admin = admin_address(env);
        let contract_id = env.register(EscrowContract, ());
        let token = Address::generate(env);
        let treasury = Address::generate(env);
        EscrowContractClient::new(env, &contract_id)
            .initialize(&admin, &token, &treasury, &100u32, &token);
        (contract_id, admin)
    }

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    #[test]
    fn test_happy_path_propose_then_accept() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let new_admin = Address::generate(&env);

        // Propose the transfer
        client.propose_admin(&new_admin);

        // Pending admin is visible via the getter
        assert_eq!(
            client.get_pending_admin(),
            Some(new_admin.clone()),
            "pending admin must be set after propose"
        );

        // New admin accepts
        client.accept_admin(&new_admin);

        // get_admin() now returns the new address
        assert_eq!(
            client.get_admin(),
            new_admin,
            "get_admin must return new admin after accept"
        );

        // PendingAdmin is cleared
        assert_eq!(
            client.get_pending_admin(),
            None,
            "pending admin must be cleared after accept"
        );
    }

    // -----------------------------------------------------------------------
    // Wrong acceptor
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "caller is not the pending admin")]
    fn test_wrong_acceptor_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let intended_new_admin = Address::generate(&env);
        let stranger = Address::generate(&env);

        client.propose_admin(&intended_new_admin);

        // A different address tries to accept — must panic
        client.accept_admin(&stranger);
    }

    // -----------------------------------------------------------------------
    // Overwrite pending proposal
    // -----------------------------------------------------------------------

    #[test]
    fn test_second_proposal_overwrites_first() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let first_candidate = Address::generate(&env);
        let second_candidate = Address::generate(&env);

        // First proposal
        client.propose_admin(&first_candidate);
        assert_eq!(client.get_pending_admin(), Some(first_candidate.clone()));

        // Second proposal overwrites the first
        client.propose_admin(&second_candidate);
        assert_eq!(
            client.get_pending_admin(),
            Some(second_candidate.clone()),
            "second proposal must replace the first"
        );
    }

    #[test]
    #[should_panic(expected = "caller is not the pending admin")]
    fn test_first_candidate_cannot_accept_after_overwrite() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let first_candidate = Address::generate(&env);
        let second_candidate = Address::generate(&env);

        client.propose_admin(&first_candidate);
        client.propose_admin(&second_candidate);

        // First candidate tries to accept after being overwritten — must panic
        client.accept_admin(&first_candidate);
    }

    // -----------------------------------------------------------------------
    // No pending transfer
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "no pending admin transfer")]
    fn test_accept_without_propose_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let random = Address::generate(&env);

        // No proposal was made — must panic
        client.accept_admin(&random);
    }

    // -----------------------------------------------------------------------
    // Non-admin cannot propose
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic]
    fn test_non_admin_cannot_propose() {
        let env = Env::default();
        // Do NOT use mock_all_auths — we want auth to fail for the stranger
        let (contract_id, _admin) = setup(&env);
        let stranger = Address::generate(&env);
        let new_admin = Address::generate(&env);

        EscrowContractClient::new(&env, &contract_id)
            .mock_auths(&[soroban_sdk::testutils::MockAuth {
                address: &stranger,
                invoke: &soroban_sdk::testutils::MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "propose_admin",
                    args: soroban_sdk::vec![
                        &env,
                        soroban_sdk::IntoVal::<Env, soroban_sdk::Val>::into_val(
                            &new_admin,
                            &env,
                        ),
                    ],
                    sub_invokes: &[],
                },
            }])
            .propose_admin(&new_admin);
    }

    // -----------------------------------------------------------------------
    // Event shape (Issue #285)
    // -----------------------------------------------------------------------

    /// The most recent event emitted by the escrow contract.
    fn last_event(env: &Env, contract_id: &Address) -> ContractEvent {
        env.events()
            .all()
            .filter_by_contract(contract_id)
            .events()
            .last()
            .cloned()
            .expect("no event emitted by the escrow contract")
    }

    fn symbol_scval(env: &Env, name: &str) -> ScVal {
        let val: Val = Symbol::new(env, name).into_val(env);
        ScVal::try_from_val(env, &val).unwrap()
    }

    /// Assert the event's topics and payload field names match what
    /// `schemas/events/amana_escrow.events.json` (see `docs/event-schema.md`)
    /// declares for `event_name`.
    fn assert_matches_documented_schema(env: &Env, event: &ContractEvent, event_name: &str) {
        let ContractEventBody::V0(body) = &event.body;

        let (_, documented_topics) = event_schema::EVENT_TOPICS
            .iter()
            .find(|(name, _)| *name == event_name)
            .expect("event missing from the documented topic schema");
        let expected_topics: std::vec::Vec<ScVal> = documented_topics
            .iter()
            .map(|topic| symbol_scval(env, topic))
            .collect();
        assert_eq!(
            body.topics.to_vec(),
            expected_topics,
            "{event_name} topics differ from docs/event-schema.md"
        );

        let (_, documented_fields) = event_schema::EVENT_FIELDS
            .iter()
            .find(|(name, _)| *name == event_name)
            .expect("event missing from the documented field schema");
        let ScVal::Map(Some(map)) = &body.data else {
            panic!("{event_name} payload must be a map of named fields");
        };
        let actual_keys: std::vec::Vec<ScVal> = map.iter().map(|entry| entry.key.clone()).collect();
        assert_eq!(
            actual_keys.len(),
            documented_fields.len(),
            "{event_name} field count differs from docs/event-schema.md"
        );
        for field in documented_fields.iter() {
            assert!(
                actual_keys.contains(&symbol_scval(env, field)),
                "{event_name} payload is missing documented field `{field}`"
            );
        }
    }

    #[test]
    fn test_propose_admin_emits_documented_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let new_admin = Address::generate(&env);

        client.propose_admin(&new_admin);

        let event = last_event(&env, &contract_id);
        assert_matches_documented_schema(&env, &event, "AdminTransferProposedEvent");
        assert_eq!(
            event,
            AdminTransferProposedEvent {
                current_admin: admin,
                pending_admin: new_admin,
            }
            .to_xdr(&env, &contract_id),
            "ADMPRP must carry current_admin and pending_admin"
        );
    }

    #[test]
    fn test_accept_admin_emits_documented_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let new_admin = Address::generate(&env);

        client.propose_admin(&new_admin);
        client.accept_admin(&new_admin);

        let event = last_event(&env, &contract_id);
        assert_matches_documented_schema(&env, &event, "AdminTransferAcceptedEvent");
        assert_eq!(
            event,
            AdminTransferAcceptedEvent {
                old_admin: admin,
                new_admin,
            }
            .to_xdr(&env, &contract_id),
            "ADMACC must carry old_admin and new_admin"
        );
    }

    #[test]
    fn test_second_proposal_emits_event_for_new_candidate() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, admin) = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);
        let first_candidate = Address::generate(&env);
        let second_candidate = Address::generate(&env);

        client.propose_admin(&first_candidate);
        client.propose_admin(&second_candidate);

        assert_eq!(
            last_event(&env, &contract_id),
            AdminTransferProposedEvent {
                current_admin: admin,
                pending_admin: second_candidate,
            }
            .to_xdr(&env, &contract_id),
            "the overwriting proposal must announce the new pending admin"
        );
    }
}

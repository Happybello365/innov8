/// Issue #272 (with #8) — the evidence-per-party cap is enforced by
/// `submit_evidence` and exposed read-only via `get_max_evidence_per_party`.
///
/// The boundary tests drive the cap from the getter's value, so the getter and
/// the enforced cap cannot drift apart without a test failing.
#[cfg(test)]
mod evidence_cap_tests {
    extern crate std;
    use crate::test_fixture::AdminSignerFixture;
    use crate::MAX_EVIDENCE_PER_PARTY;
    use soroban_sdk::{Address, String};

    fn disputed_trade(f: &AdminSignerFixture) -> u64 {
        let trade_id = f.funded_trade(10_000);
        f.client().initiate_dispute(
            &trade_id,
            &f.buyer,
            &String::from_str(&f.env, "QmDisputeReason"),
        );
        trade_id
    }

    fn submit(f: &AdminSignerFixture, trade_id: u64, who: &Address, n: u32) -> bool {
        f.client()
            .try_submit_evidence(
                &trade_id,
                who,
                &String::from_str(&f.env, &std::format!("QmEvidence{n}")),
                &String::from_str(&f.env, "QmDescription"),
            )
            .is_ok()
    }

    #[test]
    fn getter_returns_the_contract_constant() {
        let f = AdminSignerFixture::new();
        assert_eq!(f.client().get_max_evidence_per_party(), MAX_EVIDENCE_PER_PARTY);
        assert!(MAX_EVIDENCE_PER_PARTY > 0);
    }

    #[test]
    fn exactly_the_cap_is_accepted() {
        let f = AdminSignerFixture::new();
        let trade_id = disputed_trade(&f);
        let cap = f.client().get_max_evidence_per_party();

        for i in 0..cap {
            assert!(submit(&f, trade_id, &f.buyer, i), "submission {i} within the cap must succeed");
        }
        assert_eq!(f.client().get_evidence_list(&trade_id).len(), cap);
    }

    #[test]
    fn cap_plus_one_is_rejected_and_not_stored() {
        let f = AdminSignerFixture::new();
        let trade_id = disputed_trade(&f);
        let cap = f.client().get_max_evidence_per_party();

        for i in 0..cap {
            assert!(submit(&f, trade_id, &f.buyer, i));
        }
        assert!(!submit(&f, trade_id, &f.buyer, cap), "submission beyond the getter's cap must be rejected");
        assert_eq!(f.client().get_evidence_list(&trade_id).len(), cap);
    }

    #[test]
    fn cap_is_per_party_not_shared() {
        let f = AdminSignerFixture::new();
        let trade_id = disputed_trade(&f);
        let cap = f.client().get_max_evidence_per_party();

        for i in 0..cap {
            assert!(submit(&f, trade_id, &f.buyer, i));
            assert!(submit(&f, trade_id, &f.seller, i));
            assert!(submit(&f, trade_id, &f.mediator, i));
        }
        assert_eq!(f.client().get_evidence_list(&trade_id).len(), cap * 3);
        assert!(!submit(&f, trade_id, &f.seller, cap));
    }

    #[test]
    fn cap_is_per_trade() {
        let f = AdminSignerFixture::new();
        let first = disputed_trade(&f);
        let second = disputed_trade(&f);
        let cap = f.client().get_max_evidence_per_party();

        for i in 0..cap {
            assert!(submit(&f, first, &f.buyer, i));
        }
        assert!(submit(&f, second, &f.buyer, 0), "a full first trade must not block a second trade");
    }
}

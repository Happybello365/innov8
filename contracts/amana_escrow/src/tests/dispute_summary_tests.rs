/// Issue #279 — `get_dispute_summary()` aggregated view.
///
/// The summary must agree with what a client would compute off-chain from
/// `get_dispute_votes()` and `requires_quorum()`, while `get_dispute_votes()`
/// keeps returning the full per-mediator detail.
#[cfg(test)]
#[allow(clippy::module_inception)]
mod dispute_summary_tests {
    extern crate std;

    use crate::DisputeSummary;
    use crate::TradeStatus;
    use crate::test_fixture::AdminSignerFixture;
    use soroban_sdk::{Address, String, testutils::Address as _};

    const WINDOW_SECS: u64 = 7 * 24 * 60 * 60;
    const AMOUNT: i128 = 10_000;
    const HIGH: u32 = 8_000;
    const LOW: u32 = 2_000;

    /// Fixture with quorum enabled for every trade, `n` extra mediators, no fee.
    fn setup(
        required_weight: u32,
        n: usize,
    ) -> (AdminSignerFixture, u64, std::vec::Vec<Address>) {
        let f = AdminSignerFixture::new_with_fee_bps(0);
        let mut mediators = std::vec::Vec::new();
        for _ in 0..n {
            let m = Address::generate(&f.env);
            f.client().add_mediator(&m);
            mediators.push(m);
        }
        f.client()
            .set_quorum_config(&true, &0i128, &required_weight, &WINDOW_SECS, &1u32);
        let tid = f.funded_trade(AMOUNT);
        f.client().initiate_dispute(
            &tid,
            &f.buyer,
            &String::from_str(&f.env, "QmSummaryDispute"),
        );
        (f, tid, mediators)
    }

    fn vote(f: &AdminSignerFixture, tid: u64, mediator: &Address, bps: u32) {
        f.client().cast_dispute_vote(
            &tid,
            mediator,
            &bps,
            &String::from_str(&f.env, "QmRationale"),
        );
    }

    /// The summary a client would build itself from the full vote list.
    fn offchain_summary(f: &AdminSignerFixture, tid: u64) -> DisputeSummary {
        let config = f.client().get_quorum_config();
        let votes = f.client().get_dispute_votes(&tid);

        let mut tally: std::vec::Vec<(u32, u32)> = std::vec::Vec::new();
        let mut total_weight = 0u32;
        for v in votes.iter() {
            total_weight += v.weight;
            let mut found = false;
            for entry in tally.iter_mut() {
                if entry.0 == v.seller_gets_bps {
                    entry.1 += v.weight;
                    found = true;
                    break;
                }
            }
            if !found {
                tally.push((v.seller_gets_bps, v.weight));
            }
        }

        let mut leading = (0u32, 0u32);
        let mut seen = false;
        for (bps, weight) in tally.iter() {
            if !seen || *weight > leading.1 || (*weight == leading.1 && *bps < leading.0) {
                leading = (*bps, *weight);
                seen = true;
            }
        }

        DisputeSummary {
            vote_count: votes.len(),
            total_weight,
            leading_seller_gets_bps: leading.0,
            leading_weight: leading.1,
            required_weight: config.required_weight,
            quorum_reached: leading.1 >= config.required_weight
                && f.client().requires_quorum(&tid),
        }
    }

    #[test]
    fn summary_with_no_votes_is_empty() {
        let (f, tid, _m) = setup(3, 2);

        let summary = f.client().get_dispute_summary(&tid);

        assert_eq!(summary.vote_count, 0);
        assert_eq!(summary.total_weight, 0);
        assert_eq!(summary.leading_seller_gets_bps, 0);
        assert_eq!(summary.leading_weight, 0);
        assert_eq!(summary.required_weight, 3);
        assert!(!summary.quorum_reached);
        assert_eq!(summary, offchain_summary(&f, tid));
    }

    #[test]
    fn summary_tracks_partial_votes_without_reaching_quorum() {
        let (f, tid, m) = setup(3, 3);
        vote(&f, tid, &m[0], HIGH);
        vote(&f, tid, &m[1], HIGH);

        let summary = f.client().get_dispute_summary(&tid);

        assert_eq!(summary.vote_count, 2);
        assert_eq!(summary.total_weight, 2);
        assert_eq!(summary.leading_seller_gets_bps, HIGH);
        assert_eq!(summary.leading_weight, 2);
        assert!(!summary.quorum_reached);
        assert_eq!(f.client().get_trade(&tid).status, TradeStatus::Disputed);
        assert_eq!(summary, offchain_summary(&f, tid));
    }

    #[test]
    fn summary_reports_quorum_reached_once_an_outcome_hits_required_weight() {
        let (f, tid, m) = setup(2, 2);
        vote(&f, tid, &m[0], HIGH);
        vote(&f, tid, &m[1], HIGH);

        let summary = f.client().get_dispute_summary(&tid);

        assert!(f.client().requires_quorum(&tid));
        assert!(summary.quorum_reached);
        assert_eq!(summary.leading_seller_gets_bps, HIGH);
        assert_eq!(summary.leading_weight, 2);
        assert_eq!(summary.required_weight, 2);
        assert_eq!(summary, offchain_summary(&f, tid));
    }

    #[test]
    fn summary_counts_weights_not_just_votes() {
        let (f, tid, m) = setup(3, 2);
        f.client().set_mediator_weight(&m[0], &3u32);
        vote(&f, tid, &m[0], LOW);

        let summary = f.client().get_dispute_summary(&tid);

        assert_eq!(summary.vote_count, 1);
        assert_eq!(summary.total_weight, 3);
        assert_eq!(summary.leading_weight, 3);
        assert!(summary.quorum_reached);
        assert_eq!(summary, offchain_summary(&f, tid));
    }

    #[test]
    fn split_votes_lead_with_the_lowest_seller_share_and_do_not_reach_quorum() {
        let (f, tid, m) = setup(2, 2);
        vote(&f, tid, &m[0], HIGH);
        vote(&f, tid, &m[1], LOW);

        let summary = f.client().get_dispute_summary(&tid);

        assert_eq!(summary.vote_count, 2);
        assert_eq!(summary.total_weight, 2);
        assert_eq!(summary.leading_seller_gets_bps, LOW);
        assert_eq!(summary.leading_weight, 1);
        assert!(!summary.quorum_reached);
        assert_eq!(summary, offchain_summary(&f, tid));
    }

    #[test]
    fn summary_is_empty_when_quorum_is_not_enabled() {
        let f = AdminSignerFixture::new_with_fee_bps(0);
        let tid = f.funded_trade(AMOUNT);

        let summary = f.client().get_dispute_summary(&tid);

        assert_eq!(summary.vote_count, 0);
        assert!(!summary.quorum_reached);
        assert!(!f.client().requires_quorum(&tid));
    }

    #[test]
    fn get_dispute_votes_still_returns_full_detail() {
        let (f, tid, m) = setup(3, 2);
        vote(&f, tid, &m[0], HIGH);
        vote(&f, tid, &m[1], LOW);

        let votes = f.client().get_dispute_votes(&tid);

        assert_eq!(votes.len(), 2);
        assert_eq!(votes.get(0).unwrap().mediator, m[0]);
        assert_eq!(votes.get(0).unwrap().seller_gets_bps, HIGH);
        assert_eq!(votes.get(1).unwrap().mediator, m[1]);
        assert_eq!(votes.get(1).unwrap().seller_gets_bps, LOW);
    }
}

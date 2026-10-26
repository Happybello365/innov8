/// Issue #288 — fund-conservation invariant across the escrow lifecycle.
///
/// Asserts INV-009 from `docs/money-math-invariant-catalog.md`: the escrow
/// contract's token balance always equals the sum of the escrowed amounts of
/// open trades (Funded, Delivered, Disputed) plus the accrued, unwithdrawn
/// platform fees. The scenario drives several trades through different
/// lifecycle paths and re-checks the invariant after every state change, so a
/// bug that leaks, double-counts or strands funds in any one path fails here.
#[cfg(test)]
#[allow(clippy::module_inception)]
mod fund_conservation_tests {
    use crate::test_fixture::AdminSignerFixture;
    use crate::TradeStatus;
    use soroban_sdk::{testutils::Address as _, Address, String};

    /// INV-009: `balance(contract) == Σ open trade amounts + accrued fees`.
    fn assert_funds_conserved(f: &AdminSignerFixture, trade_ids: &[u64], step: &str) {
        let open_escrow: i128 = trade_ids
            .iter()
            .map(|id| {
                let trade = f.client().get_trade(id);
                match trade.status {
                    TradeStatus::Funded | TradeStatus::Delivered | TradeStatus::Disputed => {
                        trade.amount
                    }
                    TradeStatus::Created | TradeStatus::Completed | TradeStatus::Cancelled => 0,
                }
            })
            .sum();
        let accrued_fees = f.client().get_accrued_fees();
        let held = f.token().balance(&f.contract_id);

        assert!(accrued_fees >= 0, "{step}: accrued fees went negative");
        assert_eq!(
            held,
            open_escrow + accrued_fees,
            "{step}: contract balance {held} != open escrow {open_escrow} + accrued fees {accrued_fees}"
        );
    }

    #[test]
    fn contract_balance_equals_open_escrow_plus_accrued_fees_across_lifecycle() {
        let f = AdminSignerFixture::new();
        let client = f.client();

        let released = f.funded_trade(10_000);
        let disputed = f.funded_trade(20_000);
        let clawed_back = f.funded_trade(30_000);
        let still_open = f.funded_trade(40_000);
        let trades = [released, disputed, clawed_back, still_open];
        assert_funds_conserved(&f, &trades, "after funding four trades");
        assert_eq!(f.token().balance(&f.contract_id), 100_000);

        // Path 1: delivered, then released to the seller (fee accrues).
        client.confirm_delivery(&released);
        assert_funds_conserved(&f, &trades, "after confirm_delivery");
        client.release_funds(&released, &f.buyer);
        assert_funds_conserved(&f, &trades, "after release_funds");
        assert!(client.get_accrued_fees() > 0);

        // Path 2: disputed, then split by the mediator (fee on the seller share).
        client.initiate_dispute(&disputed, &f.buyer, &String::from_str(&f.env, "QmReason"));
        assert_funds_conserved(&f, &trades, "after initiate_dispute");
        client.resolve_dispute(&disputed, &f.mediator, &5_000_u32);
        assert_funds_conserved(&f, &trades, "after resolve_dispute");

        // Path 3: partial admin clawback, then delivered and released.
        let destination = Address::generate(&f.env);
        client.admin_clawback(&clawed_back, &7_000_i128, &destination);
        assert_funds_conserved(&f, &trades, "after partial admin_clawback");
        client.confirm_delivery(&clawed_back);
        client.release_funds(&clawed_back, &f.buyer);
        assert_funds_conserved(&f, &trades, "after releasing a clawed-back trade");

        // Fee withdrawal moves funds out of both sides of the equation at once.
        let accrued = client.get_accrued_fees();
        client.withdraw_fees(&(accrued / 2), &f.treasury);
        assert_funds_conserved(&f, &trades, "after partial withdraw_fees");
        client.withdraw_fees(&client.get_accrued_fees(), &f.treasury);
        assert_funds_conserved(&f, &trades, "after withdrawing all fees");
        assert_eq!(client.get_accrued_fees(), 0);

        // The untouched trade's escrow is still held in full.
        assert_eq!(f.token().balance(&f.contract_id), 40_000);
        assert!(matches!(
            client.get_trade(&still_open).status,
            TradeStatus::Funded
        ));
    }

    #[test]
    fn full_admin_cancel_refunds_escrow_and_keeps_invariant() {
        let f = AdminSignerFixture::new();
        let client = f.client();

        let cancelled = f.funded_trade(15_000);
        let open = f.funded_trade(25_000);
        let trades = [cancelled, open];
        assert_funds_conserved(&f, &trades, "after funding");

        client.cancel_trade(&cancelled, &f.admin);
        assert_funds_conserved(&f, &trades, "after admin cancel_trade");
        assert_eq!(f.token().balance(&f.contract_id), 25_000);
    }
}

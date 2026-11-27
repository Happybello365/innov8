/// Issue #5 — `withdraw_fees` must refuse the escrow contract as destination.
/// Issue #287 — `withdraw_fees` stays capped at the accrued balance when the
/// fee rate is updated between accrual and withdrawal.
#[cfg(test)]
mod withdraw_fees_tests {
    use crate::fee_errors;
    use crate::test_fixture::AdminSignerFixture;

    /// Fund a trade, confirm delivery and release it so fees accrue.
    fn accrue_fees(f: &AdminSignerFixture) -> i128 {
        let tid = f.funded_trade(10_000);
        f.client().confirm_delivery(&tid);
        f.client().release_funds(&tid, &f.buyer);
        let accrued = f.client().get_accrued_fees();
        assert!(accrued > 0);
        accrued
    }

    #[test]
    #[should_panic(expected = "FEES_DESTINATION_IS_CONTRACT")]
    fn withdraw_fees_rejects_contract_as_destination() {
        let f = AdminSignerFixture::new();
        let accrued = accrue_fees(&f);
        f.client().withdraw_fees(&accrued, &f.contract_id);
    }

    #[test]
    fn withdraw_fees_rejection_leaves_accrued_fees_untouched() {
        let f = AdminSignerFixture::new();
        let accrued = accrue_fees(&f);
        let result = f.client().try_withdraw_fees(&accrued, &f.contract_id);
        assert!(result.is_err());
        assert_eq!(f.client().get_accrued_fees(), accrued);
    }

    #[test]
    fn withdraw_fees_to_other_destination_still_works() {
        let f = AdminSignerFixture::new();
        let accrued = accrue_fees(&f);
        f.client().withdraw_fees(&accrued, &f.treasury);
        assert_eq!(f.client().get_accrued_fees(), 0);
        assert_eq!(f.token().balance(&f.treasury), accrued);
    }

    #[test]
    fn fee_error_code_is_stable() {
        assert_eq!(
            fee_errors::DESTINATION_IS_CONTRACT,
            "FEES_DESTINATION_IS_CONTRACT"
        );
    }

    /// Accrue, raise the fee rate, then try to withdraw more than was accrued.
    /// The cap is the stored accrued balance, not a figure recomputed from the
    /// new rate (10_000 at 5% would be 500, but only 100 was accrued at 1%).
    #[test]
    fn withdraw_fees_capped_at_accrued_after_fee_bps_raised() {
        let f = AdminSignerFixture::new();
        let accrued = accrue_fees(&f);

        f.client().update_fee_bps(&500u32);

        assert!(f.client().try_withdraw_fees(&(accrued + 1), &f.treasury).is_err());
        assert!(f.client().try_withdraw_fees(&500i128, &f.treasury).is_err());
        assert_eq!(f.client().get_accrued_fees(), accrued);
        assert_eq!(f.token().balance(&f.treasury), 0);

        f.client().withdraw_fees(&accrued, &f.treasury);
        assert_eq!(f.client().get_accrued_fees(), 0);
        assert_eq!(f.token().balance(&f.treasury), accrued);
    }

    /// Fee updates interleaved with partial withdrawals never let a withdrawal
    /// exceed what remains of the accrued balance.
    #[test]
    fn withdraw_fees_capped_across_interleaved_fee_updates_and_withdrawals() {
        let f = AdminSignerFixture::new();
        let accrued = accrue_fees(&f);
        let partial = accrued / 2;
        let remaining = accrued - partial;

        f.client().update_fee_bps(&300u32);
        f.client().withdraw_fees(&partial, &f.treasury);
        assert_eq!(f.client().get_accrued_fees(), remaining);

        f.client().update_fee_bps(&200u32);
        assert!(f.client().try_withdraw_fees(&(remaining + 1), &f.treasury).is_err());
        assert_eq!(f.client().get_accrued_fees(), remaining);

        f.client().withdraw_fees(&remaining, &f.treasury);
        assert_eq!(f.client().get_accrued_fees(), 0);
        assert_eq!(f.token().balance(&f.treasury), accrued);
        assert!(f.client().try_withdraw_fees(&1i128, &f.treasury).is_err());
    }

    /// Fees accrued at the old and new rates add up; the cap is their sum and
    /// nothing above it can be withdrawn.
    #[test]
    fn withdraw_fees_cap_is_sum_of_fees_accrued_at_each_rate() {
        let f = AdminSignerFixture::new();
        let accrued_at_old_rate = accrue_fees(&f);

        f.client().update_fee_bps(&500u32);
        let accrued_at_new_rate = accrue_fees(&f) - accrued_at_old_rate;
        let total = accrued_at_old_rate + accrued_at_new_rate;
        assert_eq!(f.client().get_accrued_fees(), total);

        assert!(f.client().try_withdraw_fees(&(total + 1), &f.treasury).is_err());
        assert_eq!(f.client().get_accrued_fees(), total);

        f.client().withdraw_fees(&total, &f.treasury);
        assert_eq!(f.client().get_accrued_fees(), 0);
        assert_eq!(f.token().balance(&f.treasury), total);
    }
}

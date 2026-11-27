//! Issue #447 — Soroban resource-budget benchmark suite.
//!
//! Tracks CPU-instruction and memory-byte budgets for every public entry point
//! and fails when any entrypoint regresses by more than REGRESSION_TOLERANCE_PCT
//! percent over its recorded baseline.
//!
//! Run with:
//!   cargo test --test resource_budget_tests -- --nocapture
//!
//! Re-baselining policy (from `docs/gas-estimation.md`):
//!   1. Run the tests with --nocapture and record the printed values.
//!   2. Update `resource_budget_baselines.json` with the new values.
//!   3. Run the tests again to confirm the new baseline passes.
//!   4. Commit baseline + contract change together with a PR note explaining
//!      the intentional cost increase.
//!
//! Entrypoints benchmarked:
//!   - create_trade
//!   - deposit
//!   - confirm_delivery
//!   - release_funds
//!   - cancel_trade
//!   - initiate_dispute
//!   - resolve_dispute
//!   - add_mediator / remove_mediator / list_mediators
//!   - update_fee_bps
//!   - withdraw_fees

extern crate std;

use amana_escrow::{EscrowContract, EscrowContractClient};
use amana_escrow::test_fixture::admin_address;
use soroban_sdk::{testutils::Address as _, token, Address, Env, String as SorobanString};

/// Allowed regression over baseline before the test fails.
const REGRESSION_TOLERANCE_PCT: u64 = 10;

// ---------------------------------------------------------------------------
// Baseline table
//
// Values are intentionally generous: they are measured on the Soroban test
// host which may differ from mainnet scheduling, so they serve as regression
// guards rather than hard production budgets. Update via the re-baselining
// policy above when a deliberate change moves a measured value above baseline.
//
// Format: (cpu_instructions, memory_bytes)
// ---------------------------------------------------------------------------

struct Baseline {
    cpu: u64,
    mem: u64,
}

impl Baseline {
    const fn new(cpu: u64, mem: u64) -> Self {
        Self { cpu, mem }
    }
}

const BASELINE_CREATE_TRADE: Baseline = Baseline::new(3_500_000, 2_200_000);
const BASELINE_DEPOSIT: Baseline = Baseline::new(5_500_000, 3_200_000);
const BASELINE_CONFIRM_DELIVERY: Baseline = Baseline::new(2_500_000, 1_800_000);
const BASELINE_RELEASE_FUNDS: Baseline = Baseline::new(7_500_000, 4_000_000);
const BASELINE_CANCEL_TRADE: Baseline = Baseline::new(6_500_000, 3_700_000);
const BASELINE_INITIATE_DISPUTE: Baseline = Baseline::new(3_500_000, 2_200_000);
const BASELINE_RESOLVE_DISPUTE: Baseline = Baseline::new(9_000_000, 4_500_000);
const BASELINE_ADD_MEDIATOR: Baseline = Baseline::new(2_000_000, 1_500_000);
const BASELINE_REMOVE_MEDIATOR: Baseline = Baseline::new(2_000_000, 1_500_000);
const BASELINE_LIST_MEDIATORS_5: Baseline = Baseline::new(5_500_000, 3_200_000);
const BASELINE_UPDATE_FEE_BPS: Baseline = Baseline::new(1_500_000, 1_200_000);
const BASELINE_WITHDRAW_FEES: Baseline = Baseline::new(5_000_000, 3_000_000);

// ---------------------------------------------------------------------------
// Measured cost
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
struct Cost {
    cpu: u64,
    mem: u64,
}

impl Cost {
    fn assert_within_budget(self, label: &str, baseline: &Baseline) {
        assert!(self.cpu > 0, "{label}: CPU estimate must be non-zero");
        assert!(self.mem > 0, "{label}: MEM estimate must be non-zero");

        let max_cpu = baseline.cpu * (100 + REGRESSION_TOLERANCE_PCT) / 100;
        let max_mem = baseline.mem * (100 + REGRESSION_TOLERANCE_PCT) / 100;

        std::eprintln!(
            "[#447] {label}\n  cpu={} (baseline={}, max={})\n  mem={} (baseline={}, max={})",
            self.cpu, baseline.cpu, max_cpu,
            self.mem, baseline.mem, max_mem,
        );

        assert!(
            self.cpu <= max_cpu,
            "[#447] {label} CPU regression: {} > baseline {} + {}% allowance (max {})",
            self.cpu, baseline.cpu, REGRESSION_TOLERANCE_PCT, max_cpu
        );
        assert!(
            self.mem <= max_mem,
            "[#447] {label} MEM regression: {} > baseline {} + {}% allowance (max {})",
            self.mem, baseline.mem, REGRESSION_TOLERANCE_PCT, max_mem
        );
    }
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

struct BudgetCtx {
    env: Env,
    contract_id: Address,
    usdc_id: Address,
    admin: Address,
    buyer: Address,
    seller: Address,
    mediator: Address,
    treasury: Address,
}

impl BudgetCtx {
    fn new() -> Self {
        Self::with_amount(100_000)
    }

    fn with_amount(amount: i128) -> Self {
        let env = Env::default();
        env.mock_all_auths();
        // Reset budget to unlimited for setup so setup cost is not measured.
        env.cost_estimate().budget().reset_unlimited();

        let admin = admin_address(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let mediator = Address::generate(&env);
        let treasury = Address::generate(&env);

        let usdc_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract_id = env.register(EscrowContract, ());

        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc_id, &treasury, &100u32, &usdc_id);
        client.add_mediator(&mediator);
        client.set_mediator_weight(&mediator, &1u32);

        // Mint enough for the test scenarios
        token::StellarAssetClient::new(&env, &usdc_id).mint(&buyer, &(amount * 20));

        BudgetCtx { env, contract_id, usdc_id, admin, buyer, seller, mediator, treasury }
    }

    fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract_id)
    }

    /// Measure CPU instructions and memory bytes for the closure `f`.
    /// Budget is reset to unlimited immediately before `f` runs so setup cost
    /// is excluded, matching the methodology in `gas_footprint_tests.rs`.
    fn measure<F: FnOnce()>(&self, f: F) -> Cost {
        self.env.cost_estimate().budget().reset_unlimited();
        f();
        let budget = self.env.cost_estimate().budget();
        Cost {
            cpu: budget.cpu_instruction_cost(),
            mem: budget.memory_bytes_cost(),
        }
    }
}

// ---------------------------------------------------------------------------
// Benchmarks — one test per entry point
// ---------------------------------------------------------------------------

#[test]
fn budget_create_trade() {
    let ctx = BudgetCtx::new();
    let cost = ctx.measure(|| {
        ctx.client().create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
    });
    cost.assert_within_budget("create_trade", &BASELINE_CREATE_TRADE);
}

#[test]
fn budget_deposit() {
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &10_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    let cost = ctx.measure(|| {
        ctx.client().deposit(&trade_id);
    });
    cost.assert_within_budget("deposit", &BASELINE_DEPOSIT);
}

#[test]
fn budget_confirm_delivery() {
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &10_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    ctx.client().deposit(&trade_id);
    let cost = ctx.measure(|| {
        ctx.client().confirm_delivery(&trade_id);
    });
    cost.assert_within_budget("confirm_delivery", &BASELINE_CONFIRM_DELIVERY);
}

#[test]
fn budget_release_funds() {
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &10_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    ctx.client().deposit(&trade_id);
    ctx.client().confirm_delivery(&trade_id);
    let cost = ctx.measure(|| {
        ctx.client().release_funds(&trade_id, &ctx.buyer);
    });
    cost.assert_within_budget("release_funds", &BASELINE_RELEASE_FUNDS);
}

#[test]
fn budget_cancel_trade() {
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &10_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    ctx.client().deposit(&trade_id);
    let cost = ctx.measure(|| {
        ctx.client().cancel_trade(&trade_id, &ctx.admin);
    });
    cost.assert_within_budget("cancel_trade", &BASELINE_CANCEL_TRADE);
}

#[test]
fn budget_initiate_dispute() {
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &10_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    ctx.client().deposit(&trade_id);
    let reason = SorobanString::from_str(&ctx.env, "QmBudget447DisputeReason");
    let cost = ctx.measure(|| {
        ctx.client().initiate_dispute(&trade_id, &ctx.buyer, &reason);
    });
    cost.assert_within_budget("initiate_dispute", &BASELINE_INITIATE_DISPUTE);
}

#[test]
fn budget_resolve_dispute() {
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &10_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    ctx.client().deposit(&trade_id);
    ctx.client().initiate_dispute(
        &trade_id,
        &ctx.buyer,
        &SorobanString::from_str(&ctx.env, "QmBudget447ResolveReason"),
    );
    let cost = ctx.measure(|| {
        ctx.client().resolve_dispute(&trade_id, &ctx.mediator, &5000u32);
    });
    cost.assert_within_budget("resolve_dispute", &BASELINE_RESOLVE_DISPUTE);
}

#[test]
fn budget_add_mediator() {
    let ctx = BudgetCtx::new();
    let new_med = Address::generate(&ctx.env);
    let cost = ctx.measure(|| {
        ctx.client().add_mediator(&new_med);
    });
    cost.assert_within_budget("add_mediator", &BASELINE_ADD_MEDIATOR);
}

#[test]
fn budget_remove_mediator() {
    let ctx = BudgetCtx::new();
    let new_med = Address::generate(&ctx.env);
    ctx.client().add_mediator(&new_med);
    let cost = ctx.measure(|| {
        ctx.client().remove_mediator(&new_med);
    });
    cost.assert_within_budget("remove_mediator", &BASELINE_REMOVE_MEDIATOR);
}

/// Benchmarks `list_mediators` with 5 registered mediators — the most
/// relevant size for the current deployment (see `gas-estimation.md`).
/// Cost grows linearly with registry size; this test anchors the per-call
/// baseline at the documented size.
#[test]
fn budget_list_mediators_5() {
    let ctx = BudgetCtx::new();
    // The fixture already registered one mediator; add 4 more.
    for _ in 0..4 {
        ctx.client().add_mediator(&Address::generate(&ctx.env));
    }
    let cost = ctx.measure(|| {
        ctx.client().list_mediators();
    });
    cost.assert_within_budget("list_mediators (5 mediators)", &BASELINE_LIST_MEDIATORS_5);
}

#[test]
fn budget_update_fee_bps() {
    let ctx = BudgetCtx::new();
    let cost = ctx.measure(|| {
        ctx.client().update_fee_bps(&200u32);
    });
    cost.assert_within_budget("update_fee_bps", &BASELINE_UPDATE_FEE_BPS);
}

#[test]
fn budget_withdraw_fees() {
    // Complete a trade to accrue fees, then measure the withdrawal.
    let ctx = BudgetCtx::new();
    let trade_id = ctx.client().create_trade(
        &ctx.buyer,
        &ctx.seller,
        &100_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    ctx.client().deposit(&trade_id);
    ctx.client().confirm_delivery(&trade_id);
    ctx.client().release_funds(&trade_id, &ctx.buyer);

    let accrued = ctx.client().get_accrued_fees();
    assert!(accrued > 0, "fees must have accrued before withdrawal benchmark");

    let cost = ctx.measure(|| {
        ctx.client().withdraw_fees(&accrued, &ctx.treasury);
    });
    cost.assert_within_budget("withdraw_fees", &BASELINE_WITHDRAW_FEES);
}

// ---------------------------------------------------------------------------
// Regression comparison — new vs established baseline must not drift silently
// ---------------------------------------------------------------------------

/// Verifies that `create_trade` cost is deterministic across two back-to-back
/// measurements on the same environment. Non-deterministic cost (e.g. from
/// a hidden clock read or unbounded host-side collection) would cause flaky CI.
#[test]
fn budget_create_trade_is_deterministic() {
    let ctx = BudgetCtx::new();

    let measure_once = || -> Cost {
        let trade_id = ctx.client().create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        // We only care about the cost, not the trade ID.
        let _ = trade_id;
        ctx.env.cost_estimate().budget().cpu_instruction_cost()
    };

    ctx.env.cost_estimate().budget().reset_unlimited();
    let cpu1 = measure_once();
    ctx.env.cost_estimate().budget().reset_unlimited();
    let cpu2 = measure_once();

    // Allow a small tolerance for host-internal variance between calls.
    let diff = if cpu1 > cpu2 { cpu1 - cpu2 } else { cpu2 - cpu1 };
    let tolerance = cpu1 / 20; // 5% variance allowed
    assert!(
        diff <= tolerance,
        "[#447] create_trade CPU cost is not deterministic: first={cpu1}, second={cpu2}, diff={diff}"
    );
}

/// Verifies that the full happy-path lifecycle (create → deposit → confirm →
/// release) stays within the sum of its individual budgets plus a 20% combined-
/// path overhead allowance. This guards against interactions between entry
/// points that only emerge when they share ledger state.
#[test]
fn budget_full_lifecycle_combined() {
    let ctx = BudgetCtx::new();

    let combined_baseline = Baseline::new(
        (BASELINE_CREATE_TRADE.cpu
            + BASELINE_DEPOSIT.cpu
            + BASELINE_CONFIRM_DELIVERY.cpu
            + BASELINE_RELEASE_FUNDS.cpu)
            * 12 / 10, // 20% combined-path overhead allowance
        (BASELINE_CREATE_TRADE.mem
            + BASELINE_DEPOSIT.mem
            + BASELINE_CONFIRM_DELIVERY.mem
            + BASELINE_RELEASE_FUNDS.mem)
            * 12 / 10,
    );

    let cost = ctx.measure(|| {
        let trade_id = ctx.client().create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000i128,
            &5000u32,
            &5000u32,
            &None,
        );
        ctx.client().deposit(&trade_id);
        ctx.client().confirm_delivery(&trade_id);
        ctx.client().release_funds(&trade_id, &ctx.buyer);
    });

    cost.assert_within_budget("full_lifecycle (create+deposit+confirm+release)", &combined_baseline);
}

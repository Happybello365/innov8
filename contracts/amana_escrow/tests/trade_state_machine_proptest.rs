//! Issue #276 — property-based tests for the trade state machine.
//!
//! Random sequences of entrypoint calls (valid and invalid) are applied to one
//! trade. Whatever the sequence, the trade must stay in a documented state,
//! keep its immutable fields, and obey the structural transition rules below.

extern crate std;

use amana_escrow::{EscrowContract, EscrowContractClient, TradeStatus};
use proptest::prelude::*;
use soroban_sdk::{Address, Env, String as SStr, testutils::Address as _, token};

const AMOUNT: i128 = 10_000;

#[derive(Clone, Debug)]
enum Op {
    Deposit,
    ConfirmDelivery,
    Release,
    Dispute,
    Cancel,
    Refund,
    Resolve(u32),
}

fn op_strategy() -> impl Strategy<Value = Op> {
    prop_oneof![
        Just(Op::Deposit),
        Just(Op::ConfirmDelivery),
        Just(Op::Release),
        Just(Op::Dispute),
        Just(Op::Cancel),
        Just(Op::Refund),
        (0u32..=10_000).prop_map(Op::Resolve),
    ]
}

fn is_documented(status: &TradeStatus) -> bool {
    matches!(
        status,
        TradeStatus::Created
            | TradeStatus::Funded
            | TradeStatus::Delivered
            | TradeStatus::Completed
            | TradeStatus::Disputed
            | TradeStatus::Cancelled
    )
}

fn is_terminal(status: &TradeStatus) -> bool {
    matches!(status, TradeStatus::Completed | TradeStatus::Cancelled)
}

/// Structural rules every single transition must obey.
fn transition_allowed(from: &TradeStatus, to: &TradeStatus) -> bool {
    if from == to {
        return true;
    }
    match from {
        // Terminal states are absorbing.
        TradeStatus::Completed | TradeStatus::Cancelled => false,
        // A trade must be funded (or cancelled) before anything else happens.
        TradeStatus::Created => matches!(to, TradeStatus::Funded | TradeStatus::Cancelled),
        // Nothing ever returns to Created.
        _ => !matches!(to, TradeStatus::Created),
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    #[test]
    fn trade_always_in_documented_state(
        ops in prop::collection::vec(op_strategy(), 1..12),
        fee_bps in 0u32..=1_000,
        buyer_loss_bps in 0u32..=10_000,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc, &treasury, &fee_bps, &usdc);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let mediator = Address::generate(&env);
        client.set_mediator(&mediator);
        token::StellarAssetClient::new(&env, &usdc).mint(&buyer, &(AMOUNT * 2));

        let trade_id = client.create_trade(
            &buyer,
            &seller,
            &AMOUNT,
            &buyer_loss_bps,
            &(10_000 - buyer_loss_bps),
            &None,
        );
        prop_assert_eq!(client.get_trade(&trade_id).status, TradeStatus::Created);

        let mut prev = TradeStatus::Created;
        for op in ops {
            // Invalid calls panic inside the contract; `try_*` surfaces them as Err.
            let _ = match op {
                Op::Deposit => client.try_deposit(&trade_id).map(|_| ()),
                Op::ConfirmDelivery => client.try_confirm_delivery(&trade_id).map(|_| ()),
                Op::Release => client.try_release_funds(&trade_id, &buyer).map(|_| ()),
                Op::Dispute => client
                    .try_initiate_dispute(&trade_id, &buyer, &SStr::from_str(&env, "QmPropReason"))
                    .map(|_| ()),
                Op::Cancel => client.try_cancel_trade(&trade_id, &buyer).map(|_| ()),
                Op::Refund => client.try_refund(&trade_id).map(|_| ()),
                Op::Resolve(bps) => client
                    .try_resolve_dispute(&trade_id, &mediator, &bps)
                    .map(|_| ()),
            };

            let trade = client.get_trade(&trade_id);
            prop_assert!(is_documented(&trade.status));
            prop_assert!(
                transition_allowed(&prev, &trade.status),
                "illegal transition {:?} -> {:?}", prev, trade.status
            );
            prop_assert_eq!(trade.amount, AMOUNT);
            prop_assert_eq!(&trade.buyer, &buyer);
            prop_assert_eq!(&trade.seller, &seller);
            if is_terminal(&prev) {
                prop_assert_eq!(&trade.status, &prev);
            }
            prev = trade.status;
        }
    }
}

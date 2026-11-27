//! Issue #275 — `get_pause_metadata()` records why and when the contract was paused.

extern crate std;

use amana_escrow::{
    DEFAULT_PAUSE_REASON, EscrowContract, EscrowContractClient, PauseMetadata,
};
use soroban_sdk::{
    Address, Env, String as SStr,
    testutils::{Address as _, Ledger},
};

fn setup() -> (Env, EscrowContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin, &usdc, &treasury, &100_u32, &usdc);
    let guardian = Address::generate(&env);
    client.add_guardian(&guardian);
    (env, client, guardian)
}

#[test]
fn metadata_is_none_before_any_pause() {
    let (_env, client, _guardian) = setup();
    assert_eq!(client.get_pause_metadata(), None);
}

#[test]
fn pause_with_reason_stores_reason_and_timestamp() {
    let (env, client, guardian) = setup();
    env.ledger().set_timestamp(1_700_000_000);

    let reason = SStr::from_str(&env, "suspected oracle exploit");
    client.pause_with_reason(&guardian, &reason);

    assert!(client.is_paused());
    assert_eq!(
        client.get_pause_metadata(),
        Some(PauseMetadata {
            reason,
            paused_at: 1_700_000_000
        })
    );
}

#[test]
fn plain_pause_still_works_and_uses_default_reason() {
    let (env, client, guardian) = setup();
    env.ledger().set_timestamp(42);

    client.pause(&guardian);

    assert!(client.is_paused());
    assert_eq!(
        client.get_pause_metadata(),
        Some(PauseMetadata {
            reason: SStr::from_str(&env, DEFAULT_PAUSE_REASON),
            paused_at: 42
        })
    );
}

#[test]
fn metadata_is_retained_after_unpause_and_overwritten_by_next_pause() {
    let (env, client, guardian) = setup();
    env.ledger().set_timestamp(100);
    client.pause_with_reason(&guardian, &SStr::from_str(&env, "first"));
    client.unpause(&guardian);

    assert!(!client.is_paused());
    assert_eq!(client.get_pause_metadata().unwrap().paused_at, 100);

    env.ledger().set_timestamp(200);
    client.pause_with_reason(&guardian, &SStr::from_str(&env, "second"));
    let meta = client.get_pause_metadata().unwrap();
    assert_eq!(meta.reason, SStr::from_str(&env, "second"));
    assert_eq!(meta.paused_at, 200);
}

#[test]
fn non_guardian_cannot_pause_with_reason() {
    let (env, client, _guardian) = setup();
    let stranger = Address::generate(&env);
    let res = client.try_pause_with_reason(&stranger, &SStr::from_str(&env, "nope"));
    assert!(res.is_err());
    assert!(!client.is_paused());
    assert_eq!(client.get_pause_metadata(), None);
}

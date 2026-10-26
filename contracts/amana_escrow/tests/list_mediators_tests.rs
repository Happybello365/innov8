//! Issue #274 — `list_mediators()` returns every registered mediator with its weight.

extern crate std;

use amana_escrow::{
    DEFAULT_MEDIATOR_WEIGHT, EscrowContract, EscrowContractClient, MediatorInfo,
};
use soroban_sdk::{Address, Env, testutils::Address as _};

fn setup() -> (Env, EscrowContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin, &usdc, &treasury, &100_u32, &usdc);
    (env, client)
}

#[test]
fn list_mediators_is_empty_with_zero_mediators() {
    let (_env, client) = setup();
    assert_eq!(client.list_mediators().len(), 0);
}

#[test]
fn list_mediators_returns_single_mediator_with_default_weight() {
    let (env, client) = setup();
    let m = Address::generate(&env);
    client.add_mediator(&m);

    let list = client.list_mediators();
    assert_eq!(list.len(), 1);
    assert_eq!(
        list.get(0).unwrap(),
        MediatorInfo {
            address: m,
            weight: DEFAULT_MEDIATOR_WEIGHT
        }
    );
}

#[test]
fn list_mediators_returns_several_mediators_with_weights() {
    let (env, client) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);
    client.add_mediator(&a);
    client.add_mediator(&b);
    client.set_mediator(&c);
    client.set_mediator_weight(&b, &5_u32);

    let list = client.list_mediators();
    assert_eq!(list.len(), 3);
    assert_eq!(list.get(0).unwrap(), MediatorInfo { address: a, weight: 1 });
    assert_eq!(list.get(1).unwrap(), MediatorInfo { address: b, weight: 5 });
    assert_eq!(list.get(2).unwrap(), MediatorInfo { address: c, weight: 1 });
}

#[test]
fn list_mediators_has_no_duplicates_on_repeat_add() {
    let (env, client) = setup();
    let m = Address::generate(&env);
    client.add_mediator(&m);
    client.add_mediator(&m);
    client.set_mediator(&m);
    assert_eq!(client.list_mediators().len(), 1);
}

#[test]
fn list_mediators_drops_removed_mediators() {
    let (env, client) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.add_mediator(&a);
    client.add_mediator(&b);
    client.remove_mediator(&a);

    let list = client.list_mediators();
    assert_eq!(list.len(), 1);
    assert_eq!(list.get(0).unwrap().address, b);
}

#[test]
fn list_mediators_matches_is_mediator() {
    let (env, client) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);
    client.add_mediator(&a);
    client.add_mediator(&b);
    client.add_mediator(&c);
    client.remove_mediator(&b);

    let list = client.list_mediators();
    for addr in [&a, &b, &c] {
        let listed = list.iter().any(|m| &m.address == addr);
        assert_eq!(listed, client.is_mediator(addr));
    }
}

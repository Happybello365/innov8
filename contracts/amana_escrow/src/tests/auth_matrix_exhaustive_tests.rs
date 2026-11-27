/// Issue #277 — exhaustive authorization matrix.
///
/// `tests/auth_matrix_tests.rs` checks entrypoints one at a time. This suite is
/// the single place that enumerates **every** public entrypoint and every
/// caller role (buyer, seller, mediator, guardian, admin, stranger), and fails
/// when the two drift apart:
///
/// - Each public entrypoint in `lib.rs` must be classified as read-only, exempt,
///   or part of the mutating matrix below. A new entrypoint that is not
///   classified fails `every_entrypoint_is_classified`.
/// - Read-only entrypoints may not touch storage or publish events, and every
///   mutating entrypoint must call `require_auth` (or `require_mediator`).
/// - Every mutating entrypoint is invoked once per role with **only** that
///   role's authorization mocked, and must reject every role outside its
///   documented authorized set.
///
/// Two kinds of entrypoint exist:
///
/// - *Stored-party* entrypoints authorize an address the contract itself
///   resolves (the admin, or the trade's buyer/seller). The signer is the only
///   variable, so rejection must be an authorization failure.
/// - *Claimed-caller* entrypoints take the acting address as an argument
///   (`caller`, `initiator`, `mediator`, ...). Each role is tried both as an
///   honest caller and as a spoofed one, where the signer differs from the
///   address the call claims to act for.
#[cfg(test)]
#[allow(clippy::module_inception)]
mod auth_matrix_exhaustive_tests {
    extern crate std;

    use crate::test_fixture::AdminSignerFixture;
    use soroban_sdk::{
        Address, BytesN, IntoVal, String, Symbol, Val, Vec as SVec,
        testutils::{Address as _, MockAuth, MockAuthInvoke},
    };
    use std::boxed::Box;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::string::{String as StdString, ToString};
    use std::vec::Vec;

    // -----------------------------------------------------------------------
    // Classification
    // -----------------------------------------------------------------------

    const SOURCE: &str = include_str!("../lib.rs");

    /// Entrypoints that never write state, emit events, or move funds.
    const READ_ONLY: &[&str] = &[
        "is_mediator",
        "is_guardian",
        "is_paused",
        "is_asset_allowed",
        "get_asset_decimals",
        "get_schema_version",
        "get_accrued_fees",
        "get_queued_operation",
        "get_clawback_total",
        "is_clawback_enabled",
        "get_claimed_amount",
        "get_stream_accounting",
        "get_source_token",
        "get_admin",
        "get_pending_admin",
        "get_token_contract",
        "get_treasury",
        "get_fee_bps",
        "get_extension_policy",
        "get_extension_status",
        "get_dispute_record",
        "get_quorum_config",
        "get_mediator_weight",
        "requires_quorum",
        "get_dispute_votes",
        "get_dispute_summary",
        "get_evidence_list",
        "get_evidence",
        "get_manifest",
        "get_release_sequence",
        "get_video_proof",
        "get_trade",
        "get_trade_history",
        "get_contract_metrics",
    ];

    /// Mutating entrypoints that cannot be driven through the matrix.
    ///
    /// `initialize` is one-shot: once the fixture has initialised the contract
    /// every further call panics with `AlreadyInitialized` before authorization
    /// is consulted, so a role matrix would only observe that panic. Its
    /// authorization and double-call guard are covered by
    /// `auth_matrix_tests::test_auth_initialize_rejects_second_call`.
    const EXEMPT: &[&str] = &["initialize"];

    /// Public entrypoints parsed out of `lib.rs`: `(name, source text)`.
    fn entrypoints() -> Vec<(StdString, StdString)> {
        let lines: Vec<&str> = SOURCE.lines().collect();
        let mut found = Vec::new();
        let mut i = 0;
        while i < lines.len() {
            if let Some(rest) = lines[i].strip_prefix("    pub fn ") {
                let name = rest.split('(').next().unwrap_or("").trim().to_string();
                let mut body = StdString::new();
                let mut j = i;
                while j < lines.len() {
                    body.push_str(lines[j]);
                    body.push('\n');
                    if lines[j] == "    }" {
                        break;
                    }
                    j += 1;
                }
                found.push((name, body));
                i = j;
            }
            i += 1;
        }
        found
    }

    fn matrix_names() -> Vec<&'static str> {
        cases().iter().map(|c| c.name).collect()
    }

    #[test]
    fn every_entrypoint_is_classified() {
        let matrix = matrix_names();
        let found = entrypoints();
        assert!(
            found.len() > 30,
            "entrypoint scan looks broken: only {} found",
            found.len()
        );

        for (name, _) in found.iter() {
            let mut memberships = 0;
            if READ_ONLY.contains(&name.as_str()) {
                memberships += 1;
            }
            if EXEMPT.contains(&name.as_str()) {
                memberships += 1;
            }
            if matrix.contains(&name.as_str()) {
                memberships += 1;
            }
            assert_eq!(
                memberships, 1,
                "public entrypoint `{name}` must be listed exactly once in READ_ONLY, EXEMPT, \
                 or the mutating matrix (`cases()`); add a matrix row if it changes state"
            );
        }

        let names: Vec<&str> = found.iter().map(|(n, _)| n.as_str()).collect();
        for listed in READ_ONLY.iter().chain(EXEMPT.iter()).chain(matrix.iter()) {
            assert!(
                names.contains(listed),
                "`{listed}` is classified here but is no longer a public entrypoint"
            );
        }
    }

    #[test]
    fn read_only_entrypoints_do_not_mutate() {
        for (name, body) in entrypoints() {
            if !READ_ONLY.contains(&name.as_str()) {
                continue;
            }
            for forbidden in [".set(", ".remove(", ".publish(", "extend_ttl", "bump_", "transfer("] {
                assert!(
                    !body.contains(forbidden),
                    "`{name}` is classified read-only but contains `{forbidden}`"
                );
            }
        }
    }

    #[test]
    fn every_mutating_entrypoint_checks_authorization() {
        for (name, body) in entrypoints() {
            if READ_ONLY.contains(&name.as_str()) {
                continue;
            }
            assert!(
                body.contains("require_auth") || body.contains("require_mediator("),
                "mutating entrypoint `{name}` has no authorization check"
            );
        }
    }

    // -----------------------------------------------------------------------
    // Roles and fixture
    // -----------------------------------------------------------------------

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum Role {
        Buyer,
        Seller,
        Mediator,
        Guardian,
        Admin,
        Stranger,
    }

    const ALL_ROLES: [Role; 6] = [
        Role::Buyer,
        Role::Seller,
        Role::Mediator,
        Role::Guardian,
        Role::Admin,
        Role::Stranger,
    ];

    struct Fx {
        f: AdminSignerFixture,
        guardian: Address,
    }

    impl Fx {
        fn new() -> Self {
            let f = AdminSignerFixture::new();
            let guardian = Address::generate(&f.env);
            f.client().add_guardian(&guardian);
            Fx { f, guardian }
        }

        fn addr(&self, role: Role) -> Address {
            match role {
                Role::Buyer => self.f.buyer.clone(),
                Role::Seller => self.f.seller.clone(),
                Role::Mediator => self.f.mediator.clone(),
                Role::Guardian => self.guardian.clone(),
                Role::Admin => self.f.admin.clone(),
                Role::Stranger => self.f.stranger.clone(),
            }
        }

        /// A trade that exists but has not been funded.
        fn created(&self) -> u64 {
            self.f.client().create_trade(
                &self.f.buyer,
                &self.f.seller,
                &1_000i128,
                &5000u32,
                &5000u32,
                &None,
            )
        }

        fn funded(&self) -> u64 {
            self.f.funded_trade(1_000)
        }

        fn delivered(&self) -> u64 {
            let tid = self.funded();
            self.f.client().confirm_delivery(&tid);
            tid
        }

        fn disputed(&self) -> u64 {
            let tid = self.funded();
            self.f.client().initiate_dispute(
                &tid,
                &self.f.buyer,
                &String::from_str(&self.f.env, "QmMatrixDispute"),
            );
            tid
        }

        fn text(&self, s: &str) -> String {
            String::from_str(&self.f.env, s)
        }
    }

    /// Build the argument vector for a call. Every argument is converted to a
    /// `Val` against the fixture's environment.
    macro_rules! args {
        ($fx:expr; $($a:expr),* $(,)?) => {
            soroban_sdk::vec![&$fx.f.env, $($a.into_val(&$fx.f.env)),*]
        };
    }

    // -----------------------------------------------------------------------
    // Matrix
    // -----------------------------------------------------------------------

    /// Builds the call arguments for a case. `claimed` is the address the call
    /// acts for; stored-party cases ignore it.
    type Build = fn(&Fx, &Address) -> SVec<Val>;

    struct Case {
        name: &'static str,
        /// Roles whose authorization alone is enough to run the call.
        allowed: &'static [Role],
        build: Build,
        /// The acting address is an argument (`caller`, `initiator`, ...).
        claimed: bool,
        /// `require_auth` is reached before any other check can panic, so a
        /// spoofed caller must fail with an authorization error specifically.
        auth_first: bool,
        /// The fixture state lets the role check run, so a disallowed honest
        /// caller is observably rejected.
        reachable: bool,
        /// The call pulls tokens from the caller, which needs the token's own
        /// sub-authorization; the allowed-role check is skipped for it.
        token_pull: bool,
    }

    fn stored(name: &'static str, allowed: &'static [Role], build: Build) -> Case {
        Case {
            name,
            allowed,
            build,
            claimed: false,
            auth_first: true,
            reachable: true,
            token_pull: false,
        }
    }

    fn claimed(name: &'static str, allowed: &'static [Role], build: Build) -> Case {
        Case {
            claimed: true,
            ..stored(name, allowed, build)
        }
    }

    const ADMIN_ONLY: &[Role] = &[Role::Admin];
    const BUYER_ONLY: &[Role] = &[Role::Buyer];
    const SELLER_ONLY: &[Role] = &[Role::Seller];
    const PARTIES: &[Role] = &[Role::Buyer, Role::Seller];
    const NOBODY_ALONE: &[Role] = &[];

    fn cases() -> Vec<Case> {
        let mut c: Vec<Case> = Vec::new();

        // ---- admin-only configuration ------------------------------------
        c.push(stored("set_mediator", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.f.stranger)
        }));
        c.push(stored("add_mediator", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.f.stranger)
        }));
        c.push(stored("remove_mediator", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.f.mediator)
        }));
        c.push(stored("add_guardian", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.f.stranger)
        }));
        c.push(stored("remove_guardian", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.guardian)
        }));
        c.push(stored("allow_asset", ADMIN_ONLY, |fx, _| {
            let decimals = 7u32;
            args!(fx; fx.f.token_id, decimals)
        }));
        c.push(stored("disallow_asset", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.f.token_id)
        }));
        c.push(stored("update_fee_bps", ADMIN_ONLY, |fx, _| {
            let fee = 200u32;
            args!(fx; fee)
        }));
        c.push(stored("withdraw_fees", ADMIN_ONLY, |fx, _| {
            let amount = 1i128;
            args!(fx; amount, fx.f.treasury)
        }));
        c.push(stored("queue_clawback", ADMIN_ONLY, |fx, _| {
            let (trade_id, amount) = (1u64, 1i128);
            args!(fx; trade_id, amount, fx.f.stranger)
        }));
        c.push(stored("execute_clawback", ADMIN_ONLY, |fx, _| {
            let operation_id = 1u64;
            args!(fx; operation_id)
        }));
        c.push(stored("cancel_queued_operation", ADMIN_ONLY, |fx, _| {
            let operation_id = 1u64;
            args!(fx; operation_id)
        }));
        c.push(stored("admin_clawback", ADMIN_ONLY, |fx, _| {
            let (trade_id, amount) = (1u64, 1i128);
            args!(fx; trade_id, amount, fx.f.stranger)
        }));
        c.push(stored("set_clawback_enabled", ADMIN_ONLY, |fx, _| {
            let enabled = true;
            args!(fx; enabled)
        }));
        c.push(stored("queue_upgrade", ADMIN_ONLY, |fx, _| {
            let hash = BytesN::from_array(&fx.f.env, &[0u8; 32]);
            args!(fx; hash)
        }));
        c.push(stored("execute_upgrade", ADMIN_ONLY, |fx, _| {
            let operation_id = 1u64;
            args!(fx; operation_id)
        }));
        c.push(stored("propose_admin", ADMIN_ONLY, |fx, _| {
            args!(fx; fx.f.stranger)
        }));
        c.push(stored("set_extension_policy", ADMIN_ONLY, |fx, _| {
            let (count, secs) = (3u32, 86_400u64);
            args!(fx; count, secs)
        }));
        c.push(stored("set_quorum_config", ADMIN_ONLY, |fx, _| {
            let (enabled, threshold, required, window, fallback) =
                (true, 0i128, 2u32, 100u64, 1u32);
            args!(fx; enabled, threshold, required, window, fallback)
        }));
        c.push(stored("set_mediator_weight", ADMIN_ONLY, |fx, _| {
            let weight = 2u32;
            args!(fx; fx.f.mediator, weight)
        }));

        // ---- trade parties (authorized by the stored trade) --------------
        c.push(Case {
            token_pull: true,
            ..stored("deposit", BUYER_ONLY, |fx, _| {
                let tid = fx.created();
                args!(fx; tid)
            })
        });
        c.push(stored("cancel_by_buyer", BUYER_ONLY, |fx, _| {
            let tid = fx.created();
            args!(fx; tid)
        }));
        c.push(stored("refund", SELLER_ONLY, |fx, _| {
            let tid = fx.funded();
            args!(fx; tid)
        }));
        c.push(stored("confirm_delivery", BUYER_ONLY, |fx, _| {
            let tid = fx.funded();
            args!(fx; tid)
        }));
        // Needs both signatures at once, so no single role is enough.
        c.push(stored("extend_deadline", NOBODY_ALONE, |fx, _| {
            let tid = fx.funded();
            let new_deadline = 9_999_999_999u64;
            args!(fx; tid, new_deadline)
        }));

        // ---- claimed-caller entrypoints ----------------------------------
        c.push(claimed("pause", &[Role::Guardian], |fx, who| {
            args!(fx; who)
        }));
        c.push(claimed("unpause", &[Role::Guardian], |fx, who| {
            args!(fx; who)
        }));
        c.push(claimed("create_trade", &ALL_ROLES, |fx, who| {
            let seller = if *who == fx.f.seller {
                fx.f.stranger.clone()
            } else {
                fx.f.seller.clone()
            };
            let (amount, buyer_bps, seller_bps, expires): (i128, u32, u32, Option<u64>) =
                (1_000, 5000, 5000, None);
            args!(fx; who, seller, amount, buyer_bps, seller_bps, expires)
        }));
        c.push(Case {
            auth_first: false,
            token_pull: true,
            ..claimed("deposit_with_path", BUYER_ONLY, |fx, who| {
                let tid = fx.created();
                let (source_amount, dest_min) = (100i128, 100i128);
                let path: SVec<Address> = SVec::new(&fx.f.env);
                args!(fx; tid, who, source_amount, dest_min, path)
            })
        });
        c.push(Case {
            auth_first: false,
            ..claimed("accept_admin", &[Role::Stranger], |fx, who| {
                // The stranger is the pending admin; every other claimant is
                // rejected before or at authorization.
                fx.f.client().propose_admin(&fx.f.stranger);
                args!(fx; who)
            })
        });
        c.push(Case {
            // No path payment is pending in the fixture, so only the spoofing
            // check is observable here.
            reachable: false,
            ..claimed(
                "finalize_path_payment",
                &[Role::Buyer, Role::Admin],
                |fx, who| {
                    let tid = fx.created();
                    args!(fx; tid, who)
                },
            )
        });
        c.push(claimed(
            "cancel_trade",
            &[Role::Buyer, Role::Seller, Role::Admin],
            |fx, who| {
                let tid = fx.funded();
                args!(fx; tid, who)
            },
        ));
        c.push(claimed("claim_expiry_refund", PARTIES, |fx, who| {
            let tid = fx.funded();
            args!(fx; tid, who)
        }));
        c.push(claimed(
            "release_funds",
            &[Role::Buyer, Role::Admin],
            |fx, who| {
                let tid = fx.delivered();
                args!(fx; tid, who)
            },
        ));
        c.push(claimed("initiate_dispute", PARTIES, |fx, who| {
            let tid = fx.funded();
            let reason = fx.text("QmMatrixReason");
            args!(fx; tid, who, reason)
        }));
        c.push(claimed("resolve_dispute", &[Role::Mediator], |fx, who| {
            let tid = fx.disputed();
            let bps = 5_000u32;
            args!(fx; tid, who, bps)
        }));
        c.push(claimed("cast_dispute_vote", &[Role::Mediator], |fx, who| {
            let tid = fx.disputed();
            let bps = 5_000u32;
            let rationale = fx.text("QmMatrixRationale");
            args!(fx; tid, who, bps, rationale)
        }));
        c.push(claimed(
            "resolve_dispute_by_fallback",
            &[Role::Buyer, Role::Seller, Role::Mediator],
            |fx, who| {
                let tid = fx.disputed();
                args!(fx; tid, who)
            },
        ));
        c.push(claimed(
            "submit_evidence",
            &[Role::Buyer, Role::Seller, Role::Mediator],
            |fx, who| {
                let tid = fx.disputed();
                let (hash, description) = (fx.text("QmEvidence"), fx.text("QmDescription"));
                args!(fx; tid, who, hash, description)
            },
        ));
        c.push(claimed("submit_video_proof", PARTIES, |fx, who| {
            let tid = fx.funded();
            let cid = fx.text("QmVideo");
            args!(fx; tid, who, cid)
        }));
        c.push(claimed("submit_manifest", SELLER_ONLY, |fx, who| {
            let tid = fx.funded();
            let (driver_name, driver_id) = (fx.text("QmDriverName"), fx.text("QmDriverId"));
            args!(fx; tid, who, driver_name, driver_id)
        }));

        c
    }

    // -----------------------------------------------------------------------
    // Execution
    // -----------------------------------------------------------------------

    enum Outcome {
        Returned,
        Panicked(StdString),
    }

    impl Outcome {
        fn panicked(&self) -> bool {
            matches!(self, Outcome::Panicked(_))
        }

        /// A rejection by the host's authorization check specifically.
        fn auth_rejected(&self) -> bool {
            matches!(self, Outcome::Panicked(msg) if msg.contains("Error(Auth"))
        }
    }

    fn panic_message(payload: Box<dyn std::any::Any + Send>) -> StdString {
        if let Some(s) = payload.downcast_ref::<StdString>() {
            s.clone()
        } else if let Some(s) = payload.downcast_ref::<&str>() {
            (*s).to_string()
        } else {
            StdString::new()
        }
    }

    /// Invoke `case` on a fresh fixture where the call acts for `claimed_role`
    /// but only `signer`'s authorization is available.
    fn run(case: &Case, signer: Role, claimed_role: Role) -> Outcome {
        let fx = Fx::new();
        let claimed_addr = fx.addr(claimed_role);
        let args = (case.build)(&fx, &claimed_addr);
        let signer_addr = fx.addr(signer);

        let invoke = MockAuthInvoke {
            contract: &fx.f.contract_id,
            fn_name: case.name,
            args: args.clone(),
            sub_invokes: &[],
        };
        fx.f.env.mock_auths(&[MockAuth {
            address: &signer_addr,
            invoke: &invoke,
        }]);

        let function = Symbol::new(&fx.f.env, case.name);
        let result = catch_unwind(AssertUnwindSafe(|| {
            fx.f.env
                .invoke_contract::<Val>(&fx.f.contract_id, &function, args.clone());
        }));

        match result {
            Ok(()) => Outcome::Returned,
            Err(payload) => Outcome::Panicked(panic_message(payload)),
        }
    }

    #[test]
    fn stored_party_entrypoints_reject_every_unauthorized_role() {
        for case in cases().iter().filter(|c| !c.claimed) {
            for role in ALL_ROLES {
                let outcome = run(case, role, role);
                if case.allowed.contains(&role) {
                    if !case.token_pull {
                        assert!(
                            !outcome.auth_rejected(),
                            "`{}` must accept {:?} as an authorized role",
                            case.name,
                            role
                        );
                    }
                } else {
                    assert!(
                        outcome.auth_rejected(),
                        "`{}` must reject {:?} with an authorization error",
                        case.name,
                        role
                    );
                }
            }
        }
    }

    #[test]
    fn claimed_caller_entrypoints_reject_every_unauthorized_role() {
        for case in cases().iter().filter(|c| c.claimed) {
            for role in ALL_ROLES {
                let outcome = run(case, role, role);
                if case.allowed.contains(&role) {
                    if !case.token_pull {
                        assert!(
                            !outcome.auth_rejected(),
                            "`{}` must accept {:?} acting for itself",
                            case.name,
                            role
                        );
                    }
                } else if case.reachable {
                    assert!(
                        outcome.panicked(),
                        "`{}` must reject {:?} acting for itself",
                        case.name,
                        role
                    );
                }
            }
        }
    }

    #[test]
    fn claimed_caller_entrypoints_reject_spoofed_callers() {
        for case in cases().iter().filter(|c| c.claimed) {
            for signer in ALL_ROLES {
                for claimed_role in ALL_ROLES {
                    if signer == claimed_role {
                        continue;
                    }
                    let outcome = run(case, signer, claimed_role);
                    assert!(
                        outcome.panicked(),
                        "`{}` must reject {:?} signing for {:?}",
                        case.name,
                        signer,
                        claimed_role
                    );
                    if case.auth_first {
                        assert!(
                            outcome.auth_rejected(),
                            "`{}` must fail with an authorization error when {:?} signs for {:?}",
                            case.name,
                            signer,
                            claimed_role
                        );
                    }
                }
            }
        }
    }
}

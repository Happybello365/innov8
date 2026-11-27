//! Issue #273 — fails when `docs/contract-error-codes.md` drifts from the
//! error code constants in `src/lib.rs`.
//!
//! Every string constant inside a `pub mod *_errors` block of the contract
//! must appear as a backticked row in the documented code tables.

extern crate std;

use std::collections::BTreeSet;
use std::string::String;
use std::vec::Vec;

/// Collects the string values of every `pub const NAME: &str = "VALUE";` found
/// inside a `pub mod <name>_errors { ... }` block.
fn contract_error_codes(src: &str) -> BTreeSet<String> {
    let mut codes = BTreeSet::new();
    let mut in_errors_mod = false;
    for line in src.lines() {
        let t = line.trim();
        if t.starts_with("pub mod ") && t.contains("_errors") && t.ends_with('{') {
            in_errors_mod = true;
            continue;
        }
        if in_errors_mod {
            if t == "}" {
                in_errors_mod = false;
            } else if t.starts_with("pub const ") && t.contains(": &str") {
                if let Some(start) = t.find('"') {
                    if let Some(len) = t[start + 1..].find('"') {
                        codes.insert(String::from(&t[start + 1..start + 1 + len]));
                    }
                }
            }
        }
    }
    codes
}

/// Collects the first backticked cell of every markdown table row.
fn documented_codes(doc: &str) -> BTreeSet<String> {
    let mut codes = BTreeSet::new();
    for line in doc.lines() {
        let t = line.trim();
        if !t.starts_with("| `") {
            continue;
        }
        let rest = &t[3..];
        if let Some(end) = rest.find('`') {
            codes.insert(String::from(&rest[..end]));
        }
    }
    codes
}

#[test]
fn every_contract_error_code_is_documented_by_name() {
    let src = include_str!("../src/lib.rs");
    let doc = include_str!("../../../docs/contract-error-codes.md");

    let in_contract = contract_error_codes(src);
    let in_docs = documented_codes(doc);
    assert!(!in_contract.is_empty(), "no error codes found in lib.rs");

    let undocumented: Vec<&String> = in_contract.difference(&in_docs).collect();
    assert!(
        undocumented.is_empty(),
        "error codes missing from docs/contract-error-codes.md: {undocumented:?}"
    );
}

#[test]
fn documented_error_codes_exist_in_contract() {
    let src = include_str!("../src/lib.rs");
    let doc = include_str!("../../../docs/contract-error-codes.md");

    let in_contract = contract_error_codes(src);
    let in_docs = documented_codes(doc);

    // Only the contract-string tables are checked: rows whose code shares a
    // prefix with a contract error module.
    let prefixes = ["CLAWBACK_", "TIMELOCK_", "FEES_"];
    let stale: Vec<&String> = in_docs
        .iter()
        .filter(|c| prefixes.iter().any(|p| c.starts_with(p)))
        .filter(|c| !in_contract.contains(*c))
        .collect();
    assert!(
        stale.is_empty(),
        "documented error codes not found in lib.rs (renamed or removed?): {stale:?}"
    );
}

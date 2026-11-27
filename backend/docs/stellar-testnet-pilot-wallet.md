# Stellar Testnet Pilot Wallet Guide

This guide explains how pilot cooperative operators create, fund, and reset a Stellar
**testnet** wallet for Amana dry runs. It is documentation only and does not change
application behavior.

> **Never** commit secret keys, seed phrases, or member PII to this repository, tickets,
> chat, or pull requests. The backend never stores or logs private keys.

## 1. Network Selection

Pilot dry runs must use the Stellar **testnet**, never mainnet. Confirm the network before
creating or funding a wallet.

| Setting | Testnet value |
| --- | --- |
| Network passphrase | `Test SDF Network ; September 2015` |
| Horizon endpoint | `https://horizon-testnet.stellar.org` |
| Soroban RPC endpoint | `https://soroban-testnet.stellar.org` |
| Friendbot (funding) | `https://friendbot.stellar.org` |

Configure these through the backend environment (see `backend/.env.example`). Do not
hardcode endpoints or passphrases in source. If a required variable is missing, the
service fails fast at startup rather than running partially configured.

A wallet created on one network is **not** valid on another. A testnet keypair will not
hold funds or sign valid transactions on mainnet, and vice versa.

## 2. Wallet Creation

1. Generate a new keypair using a trusted Stellar wallet or the Stellar SDK. Store the
   secret key offline (hardware wallet or encrypted vault).
2. Record only the **public** address (`G...`) for allowlisting with the Amana team.
3. Share the public address through the private onboarding channel — never the secret key.
4. Confirm the Amana team has registered the address before attempting to authenticate.

A newly created testnet account does not exist on the ledger until it is funded (see below).

## 3. Funding

Testnet accounts are funded with test XLM via Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=<PUBLIC_ADDRESS>"
```

- Fund only the public address; Friendbot never needs the secret key.
- Start with a small amount to confirm the escrow → PoD → settlement flow.
- Pilot escrows are funded in cNGN/stablecoins; buyers may pay in local currency via
  Stellar Path Payments.

### Friendbot rate limits

Friendbot is a shared testnet service and may rate-limit or return errors. If funding
fails:

- Wait a few minutes and retry; do not loop aggressively.
- Verify the address is a valid testnet public key (`G...`, 56 characters).
- If the account already exists, Friendbot may reject the request — that is expected.

## 4. Edge Cases and Failure States

- **Unfunded account**: transactions fail with `account not found`. Fund the account via
  Friendbot before signing.
- **Wrong network**: signing or submitting against the wrong passphrase produces invalid
  signatures or `tx_bad_auth`. Re-check the network passphrase and Horizon/RPC endpoints.
- **Insufficient balance**: testnet operations require a minimum XLM reserve; top up via
  Friendbot or a testnet transfer.
- **Allowlist mismatch**: authentication fails if the public address is not registered.
  Confirm the address with the Amana team; do not reuse another operator's wallet.

## 5. Reset and Recovery

To reset a pilot testnet wallet:

1. Stop using the old address and notify the Amana team to revoke it from the allowlist.
2. Generate a fresh keypair and store the new secret key offline.
3. Fund the new public address via Friendbot.
4. Share only the new public address for allowlisting and re-verify a signed test
   transaction before resuming dry runs.

If a secret key is suspected compromised, treat it as a security incident: report it via
the private escalation channel immediately and rotate to a new keypair. Never reuse a
compromised key, even on testnet.

## 6. Support

- Operational issues: contact the Amana pilot support contact provided at onboarding.
- When filing a bug, include the trade ID, timestamps, and error codes — never secrets or PII.

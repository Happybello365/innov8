/**
 * Transaction-signing guards shared by flows that hand an XDR to Freighter.
 *
 * - Network mismatch (#481): compare the wallet's network passphrase with the
 *   one the app is configured for *before* prompting the user to sign.
 * - Signing timeout (#482): a stalled Freighter/Albedo popup must not leave the
 *   UI spinning forever; we race the call against a deadline and surface a
 *   recoverable error the caller can retry.
 */
import { withWalletTimeout, WALLET_TIMEOUT } from "./state-machine";

export const SIGNING_TIMEOUT_MS = 60_000;

export class SigningTimeoutError extends Error {
  constructor() {
    super("The wallet did not respond to the signing request in time.");
    this.name = "SigningTimeoutError";
  }
}

export class NetworkMismatchError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Your wallet is on ${actual}, but this app requires ${expected}.`);
    this.name = "NetworkMismatchError";
  }
}

const KNOWN_NETWORKS: Record<string, string> = {
  "Public Global Stellar Network ; September 2015": "PUBLIC",
  "Test SDF Network ; September 2015": "TESTNET",
  "Test SDF Future Network ; October 2022": "FUTURENET",
};

/** Human-readable name for a network passphrase (falls back to the passphrase). */
export function networkLabel(passphrase: string | null | undefined): string {
  if (!passphrase) return "UNKNOWN";
  return KNOWN_NETWORKS[passphrase] ?? passphrase;
}

export interface NetworkCheck {
  ok: boolean;
  expected: string;
  actual: string | null;
}

/**
 * Compare the wallet's reported passphrase to the expected one. A wallet that
 * cannot report its network is treated as `ok` so we never block signing on a
 * missing capability — the wallet itself will still reject a wrong passphrase.
 */
export function compareNetwork(
  walletPassphrase: string | null | undefined,
  expectedPassphrase: string,
): NetworkCheck {
  const expected = networkLabel(expectedPassphrase);
  if (!walletPassphrase) return { ok: true, expected, actual: null };
  return {
    ok: walletPassphrase === expectedPassphrase,
    expected,
    actual: networkLabel(walletPassphrase),
  };
}

type NetworkDetailsFn = () => Promise<{ networkPassphrase?: string; error?: unknown }>;

/** Query the wallet's network (best effort) and compare it with the expected passphrase. */
export async function checkWalletNetwork(
  getNetworkDetails: NetworkDetailsFn | undefined,
  expectedPassphrase: string,
  timeoutMs = 5_000,
): Promise<NetworkCheck> {
  if (typeof getNetworkDetails !== "function") {
    return compareNetwork(null, expectedPassphrase);
  }
  try {
    const res = await withWalletTimeout(Promise.resolve(getNetworkDetails()), timeoutMs);
    if (res === WALLET_TIMEOUT || !res || res.error) return compareNetwork(null, expectedPassphrase);
    return compareNetwork(res.networkPassphrase ?? null, expectedPassphrase);
  } catch {
    return compareNetwork(null, expectedPassphrase);
  }
}

/** Run a signing call with a deadline; rejects with `SigningTimeoutError` on stall. */
export async function signWithTimeout<T>(
  sign: () => Promise<T>,
  timeoutMs: number = SIGNING_TIMEOUT_MS,
): Promise<T> {
  const result = await withWalletTimeout(sign(), timeoutMs);
  if (result === WALLET_TIMEOUT) throw new SigningTimeoutError();
  return result as T;
}

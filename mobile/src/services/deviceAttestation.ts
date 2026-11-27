import { featuresApi, type ClientFeatureFlag } from '../api/features';

/**
 * Feature-flagged device attestation signal for high-risk actions (#528).
 *
 * Groundwork only: the signal is computed and returned to callers but no
 * action is blocked by it yet. Enablement comes from the
 * `mobile_device_attestation` flag and defaults to OFF, so shipping this
 * module changes no behavior.
 *
 * The result carries a status and the provider name. It never carries the raw
 * attestation token, device identifiers, or error text, so nothing sensitive
 * can leak into logs or analytics.
 */
export const DEVICE_ATTESTATION_FLAG = 'mobile_device_attestation';

export type AttestationStatus = 'disabled' | 'unsupported' | 'attested' | 'failed';

export interface AttestationSignal {
  status: AttestationStatus;
  provider: string | null;
}

/** A platform attestation provider (e.g. App Attest / Play Integrity), injected per platform. */
export interface AttestationProvider {
  name: string;
  attest(nonce: string): Promise<{ token: string }>;
}

export interface AttestationDeps {
  flag?: ClientFeatureFlag | null;
  provider?: AttestationProvider | null;
  nonce?: () => string;
  api?: typeof featuresApi;
}

/** True only when the flag exists and is explicitly enabled. */
export function isAttestationEnabled(flag: ClientFeatureFlag | null | undefined): boolean {
  return flag?.enabled === true;
}

export async function loadAttestationFlag(api = featuresApi): Promise<ClientFeatureFlag | null> {
  try {
    return await api.getFlag(DEVICE_ATTESTATION_FLAG);
  } catch {
    return null;
  }
}

function defaultNonce(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolve the attestation signal. Never throws: a missing flag, a missing
 * provider, or a provider error maps to a status instead of an exception.
 */
export async function getAttestationSignal(deps: AttestationDeps = {}): Promise<AttestationSignal> {
  const flag = deps.flag !== undefined ? deps.flag : await loadAttestationFlag(deps.api);
  if (!isAttestationEnabled(flag)) return { status: 'disabled', provider: null };

  const provider = deps.provider ?? null;
  if (!provider) return { status: 'unsupported', provider: null };

  try {
    await provider.attest((deps.nonce ?? defaultNonce)());
    return { status: 'attested', provider: provider.name };
  } catch {
    return { status: 'failed', provider: provider.name };
  }
}

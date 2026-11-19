import {
  DEVICE_ATTESTATION_FLAG,
  getAttestationSignal,
  isAttestationEnabled,
  loadAttestationFlag,
  type AttestationProvider,
} from '../deviceAttestation';

jest.mock('../../api/features', () => ({ featuresApi: { getFlag: jest.fn() } }));
import { featuresApi } from '../../api/features';

const enabled = { name: DEVICE_ATTESTATION_FLAG, enabled: true, value: null };
const disabled = { name: DEVICE_ATTESTATION_FLAG, enabled: false, value: null };

function provider(overrides: Partial<AttestationProvider> = {}): AttestationProvider {
  return {
    name: 'test-provider',
    attest: jest.fn().mockResolvedValue({ token: 'opaque-token' }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isAttestationEnabled (#528)', () => {
  it('is on only when the flag is explicitly enabled', () => {
    expect(isAttestationEnabled(enabled)).toBe(true);
    expect(isAttestationEnabled(disabled)).toBe(false);
    expect(isAttestationEnabled(null)).toBe(false);
    expect(isAttestationEnabled(undefined)).toBe(false);
  });
});

describe('loadAttestationFlag (#528)', () => {
  it('returns the flag from the features API', async () => {
    (featuresApi.getFlag as jest.Mock).mockResolvedValue(enabled);
    await expect(loadAttestationFlag(featuresApi)).resolves.toEqual(enabled);
    expect(featuresApi.getFlag).toHaveBeenCalledWith(DEVICE_ATTESTATION_FLAG);
  });

  it('fails closed to null when the API errors', async () => {
    (featuresApi.getFlag as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(loadAttestationFlag(featuresApi)).resolves.toBeNull();
  });
});

describe('getAttestationSignal (#528)', () => {
  it('reports disabled and never calls the provider when the flag is off', async () => {
    const p = provider();
    await expect(getAttestationSignal({ flag: disabled, provider: p })).resolves.toEqual({
      status: 'disabled',
      provider: null,
    });
    expect(p.attest).not.toHaveBeenCalled();
  });

  it('reports disabled when the flag cannot be read (default off)', async () => {
    (featuresApi.getFlag as jest.Mock).mockRejectedValue(new Error('network'));
    const p = provider();
    await expect(getAttestationSignal({ provider: p, api: featuresApi })).resolves.toEqual({
      status: 'disabled',
      provider: null,
    });
    expect(p.attest).not.toHaveBeenCalled();
  });

  it('reports unsupported when enabled but no platform provider exists', async () => {
    await expect(getAttestationSignal({ flag: enabled, provider: null })).resolves.toEqual({
      status: 'unsupported',
      provider: null,
    });
  });

  it('reports attested with the provider name and a fresh nonce', async () => {
    const p = provider();
    const nonce = jest.fn().mockReturnValue('nonce-123');
    await expect(getAttestationSignal({ flag: enabled, provider: p, nonce })).resolves.toEqual({
      status: 'attested',
      provider: 'test-provider',
    });
    expect(p.attest).toHaveBeenCalledWith('nonce-123');
  });

  it('maps provider errors to failed without leaking the error or token', async () => {
    const p = provider({ attest: jest.fn().mockRejectedValue(new Error('secret device detail')) });
    const signal = await getAttestationSignal({ flag: enabled, provider: p });
    expect(signal).toEqual({ status: 'failed', provider: 'test-provider' });
    expect(JSON.stringify(signal)).not.toContain('secret device detail');
  });

  it('never returns the attestation token in the signal', async () => {
    const signal = await getAttestationSignal({ flag: enabled, provider: provider() });
    expect(JSON.stringify(signal)).not.toContain('opaque-token');
  });
});

/* eslint-disable no-undef */
import { buildCrashReport, captureException, configureCrashReporting, scrubPii, scrubString } from '../crashReporting.service';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

describe('crashReporting.service (issue #267)', () => {
  beforeEach(() => {
    configureCrashReporting(null);
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({ ok: true });
  });


  it('redacts manifest PII and auth fields from context', () => {
    const scrubbed = scrubPii({
      tradeId: 'T1',
      driverName: 'Ada Obi',
      driverIdNumber: 'A1234567',
      vehicleRegistration: 'LAG-123',
      routeDescription: '12 Market Rd',
      token: 'abc',
      buyerAddress: WALLET,
      nested: { phone: '+2348012345678', note: `ping ada@example.com about ${WALLET}` },
    }) as Record<string, unknown>;

    const json = JSON.stringify(scrubbed);
    expect(scrubbed.tradeId).toBe('T1');
    for (const pii of ['Ada Obi', 'A1234567', 'LAG-123', '12 Market Rd', 'abc', WALLET, '+2348012345678', 'ada@example.com']) {
      expect(json).not.toContain(pii);
    }
  });

  it('scrubs bearer tokens and secret keys from messages', () => {
    const secret = 'S' + WALLET.slice(1);
    expect(scrubString(`Bearer abc.def.ghi failed with ${secret}`)).toBe('Bearer [REDACTED] failed with [REDACTED]');
  });

  it('builds a report with a scrubbed message and stack', () => {
    const report = buildCrashReport(new Error(`boom for ada@example.com`), true, { driverName: 'Ada' });
    expect(report.message).toBe('boom for [REDACTED]');
    expect(report.context).toEqual({ driverName: '[REDACTED]' });
    expect(report.isFatal).toBe(true);
    expect(report.appVersion).toBe('0.1.0');
  });

  it('does nothing unless enabled and configured', async () => {
    configureCrashReporting({ enabled: false, url: 'https://crash.example/report' });
    await captureException(new Error('x'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts the scrubbed report when enabled', async () => {
    configureCrashReporting({ enabled: true, url: 'https://crash.example/report' });
    await captureException(new Error('x'), { email: 'ada@example.com' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://crash.example/report');
    expect(init.body).not.toContain('ada@example.com');
  });
});

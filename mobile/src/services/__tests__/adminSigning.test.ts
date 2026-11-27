/* eslint-disable no-undef */
import { adminApi } from '../../api/admin';
import { SigningError, buildSep7Uri, submitAndConfirm } from '../adminSigning';

jest.mock('../../api/admin', () => ({
  adminApi: {
    submitSignedXdr: jest.fn(),
    getTxStatus: jest.fn(),
  },
}));

const submit = adminApi.submitSignedXdr as jest.Mock;
const status = adminApi.getTxStatus as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildSep7Uri', () => {
  it('builds a URL-encoded SEP-7 tx link', () => {
    expect(buildSep7Uri('AAA+/=')).toBe('web+stellar:tx?xdr=AAA%2B%2F%3D');
  });
});

describe('SigningError', () => {
  it('carries the failure reason and name', () => {
    const err = new SigningError('rejected', 'User rejected');
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe('rejected');
    expect(err.name).toBe('SigningError');
    expect(err.message).toBe('User rejected');
  });
});

describe('submitAndConfirm', () => {
  it('submits and resolves with the hash once confirmed', async () => {
    submit.mockResolvedValue({ hash: 'abc123' });
    status
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'success' });

    await expect(submitAndConfirm('signed-xdr', { pollIntervalMs: 1 })).resolves.toBe('abc123');
    expect(submit).toHaveBeenCalledWith('signed-xdr');
    expect(status).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith('abc123');
  });

  it('rejects with a "failed" SigningError when the network fails the tx', async () => {
    submit.mockResolvedValue({ hash: 'abc123' });
    status.mockResolvedValue({ status: 'failed' });

    const err = await submitAndConfirm('signed-xdr').catch((e) => e);
    expect(err).toBeInstanceOf(SigningError);
    expect(err.reason).toBe('failed');
  });

  it('propagates a rejection from the wallet/submit step without polling', async () => {
    submit.mockRejectedValue(new SigningError('rejected', 'User rejected the request'));

    const err = await submitAndConfirm('signed-xdr').catch((e) => e);
    expect(err).toBeInstanceOf(SigningError);
    expect(err.reason).toBe('rejected');
    expect(status).not.toHaveBeenCalled();
  });

  it('propagates network failures from submission', async () => {
    submit.mockRejectedValue(new Error('Network request failed'));
    await expect(submitAndConfirm('signed-xdr')).rejects.toThrow('Network request failed');
  });

  it('propagates network failures while polling', async () => {
    submit.mockResolvedValue({ hash: 'abc123' });
    status.mockRejectedValue(new Error('socket hang up'));
    await expect(submitAndConfirm('signed-xdr')).rejects.toThrow('socket hang up');
  });

  it('rejects with a "timeout" SigningError when confirmation never arrives', async () => {
    submit.mockResolvedValue({ hash: 'abc123' });
    status.mockResolvedValue({ status: 'pending' });

    const err = await submitAndConfirm('signed-xdr', { pollIntervalMs: 5, timeoutMs: 20 }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(SigningError);
    expect(err.reason).toBe('timeout');
  });

  it('times out immediately without polling when timeoutMs is 0', async () => {
    submit.mockResolvedValue({ hash: 'abc123' });
    const err = await submitAndConfirm('signed-xdr', { timeoutMs: 0 }).catch((e) => e);
    expect(err.reason).toBe('timeout');
    expect(status).not.toHaveBeenCalled();
  });
});

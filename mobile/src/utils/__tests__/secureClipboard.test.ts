import {
  copySensitiveValue,
  SENSITIVE_CLIPBOARD_CLEAR_MS,
  type SecureClipboardDeps,
} from '../secureClipboard';

function makeDeps(overrides: Partial<SecureClipboardDeps> = {}) {
  let clipboard = '';
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const deps: SecureClipboardDeps = {
    setString: jest.fn(async (value: string) => {
      clipboard = value;
    }),
    getString: jest.fn(async () => clipboard),
    confirm: jest.fn(async () => true),
    schedule: jest.fn((fn: () => void, ms: number) => {
      timers.push({ fn, ms });
    }),
    ...overrides,
  };
  return {
    deps,
    timers,
    read: () => clipboard,
    write: (value: string) => {
      clipboard = value;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('copySensitiveValue', () => {
  it('copies only after the user confirms', async () => {
    const { deps, read } = makeDeps();

    const result = await copySensitiveValue('trade-123', 'Trade ID', deps);

    expect(deps.confirm).toHaveBeenCalledWith('Trade ID');
    expect(result).toBe('copied');
    expect(read()).toBe('trade-123');
  });

  it('does not touch the clipboard when the user cancels', async () => {
    const { deps, read } = makeDeps({ confirm: jest.fn(async () => false) });

    const result = await copySensitiveValue('trade-123', 'Trade ID', deps);

    expect(result).toBe('cancelled');
    expect(deps.setString).not.toHaveBeenCalled();
    expect(deps.schedule).not.toHaveBeenCalled();
    expect(read()).toBe('');
  });

  it('refuses to copy an empty value without prompting', async () => {
    const { deps } = makeDeps();

    await expect(copySensitiveValue('', 'Trade ID', deps)).resolves.toBe('empty');
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.setString).not.toHaveBeenCalled();
  });

  it('schedules a clear after the default delay of one minute', async () => {
    const { deps, timers } = makeDeps();

    await copySensitiveValue('trade-123', 'Trade ID', deps);

    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(SENSITIVE_CLIPBOARD_CLEAR_MS);
    expect(SENSITIVE_CLIPBOARD_CLEAR_MS).toBe(60_000);
  });

  it('clears the clipboard when it still holds the copied value', async () => {
    const { deps, timers, read } = makeDeps();

    await copySensitiveValue('trade-123', 'Trade ID', deps, 5000);
    timers[0].fn();
    await flush();

    expect(read()).toBe('');
  });

  it('leaves the clipboard alone if the user copied something else since', async () => {
    const env = makeDeps();

    await copySensitiveValue('trade-123', 'Trade ID', env.deps, 5000);
    env.write('something-the-user-copied-later');
    env.timers[0].fn();
    await flush();

    expect(env.read()).toBe('something-the-user-copied-later');
    expect(env.deps.setString).toHaveBeenCalledTimes(1);
  });

  it('swallows clipboard read failures during the scheduled clear', async () => {
    const { deps, timers } = makeDeps({
      getString: jest.fn(async () => {
        throw new Error('clipboard unavailable');
      }),
    });

    await copySensitiveValue('trade-123', 'Trade ID', deps, 5000);

    expect(() => timers[0].fn()).not.toThrow();
    await flush();
    expect(deps.setString).toHaveBeenCalledTimes(1);
  });
});

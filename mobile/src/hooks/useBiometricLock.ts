import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  authenticateWithBiometrics,
  getBiometricLockSettings,
  shouldLockOnResume,
} from '../services/biometricLock.service';

interface BiometricLock {
  locked: boolean;
  /** Prompt for biometrics; clears the lock on success. */
  unlock: () => Promise<void>;
}

/**
 * Locks the app when it returns to the foreground after the configured idle
 * timeout (issue #258). `active` should be true only while signed in, so a
 * signed-out session is never locked.
 */
export function useBiometricLock(active: boolean): BiometricLock {
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await authenticateWithBiometrics()) setLocked(false);
  }, []);

  useEffect(() => {
    if (!active) {
      backgroundedAt.current = null;
      setLocked(false);
      return;
    }

    const onChange = async (state: AppStateStatus) => {
      if (state === 'background') {
        backgroundedAt.current ??= Date.now();
        return;
      }
      if (state !== 'active') return;

      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      const settings = await getBiometricLockSettings();
      if (shouldLockOnResume(settings, since, Date.now())) {
        setLocked(true);
        if (await authenticateWithBiometrics()) setLocked(false);
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [active]);

  return { locked, unlock };
}

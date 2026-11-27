import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * Clipboard handling for sensitive values such as trade IDs and wallet
 * addresses (#512).
 *
 * - The user must confirm before anything is written to the clipboard, since
 *   other apps on the device can read it.
 * - The clipboard is cleared after `clearAfterMs`, but only if it still holds
 *   the value we copied, so we never wipe something the user copied since.
 */

export const SENSITIVE_CLIPBOARD_CLEAR_MS = 60_000;

export interface SecureClipboardDeps {
  setString: (value: string) => Promise<unknown>;
  getString: () => Promise<string>;
  confirm: (label: string) => Promise<boolean>;
  schedule: (fn: () => void, ms: number) => unknown;
}

export type SecureCopyResult = 'copied' | 'cancelled' | 'empty';

function confirmWithAlert(label: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Copy ${label}?`,
      'Other apps on this device can read the clipboard. It will be cleared automatically after one minute.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Copy', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export const defaultSecureClipboardDeps: SecureClipboardDeps = {
  setString: (value) => Clipboard.setStringAsync(value),
  getString: () => Clipboard.getStringAsync(),
  confirm: confirmWithAlert,
  schedule: (fn, ms) => setTimeout(fn, ms),
};

/**
 * Copies a sensitive value after explicit confirmation and schedules a
 * conditional clear. Returns `cancelled` when the user declines and `empty`
 * when there is nothing to copy.
 */
export async function copySensitiveValue(
  value: string,
  label: string,
  deps: SecureClipboardDeps = defaultSecureClipboardDeps,
  clearAfterMs: number = SENSITIVE_CLIPBOARD_CLEAR_MS,
): Promise<SecureCopyResult> {
  if (!value) return 'empty';

  const approved = await deps.confirm(label);
  if (!approved) return 'cancelled';

  await deps.setString(value);

  deps.schedule(() => {
    void deps
      .getString()
      .then(async (current) => {
        if (current === value) await deps.setString('');
      })
      .catch(() => {
        // Clearing is best-effort; a failed read must not surface to the user.
      });
  }, clearAfterMs);

  return 'copied';
}

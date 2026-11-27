import { Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { toStroops } from './highValueReauth';

/**
 * Decodes an unsigned transaction so the user can see what their wallet is
 * about to sign (#513). Everything is computed locally from the XDR; the
 * backend response is not trusted for the preview.
 *
 * Fails closed: anything we cannot decode fully throws `SigningPreviewError`,
 * and callers must not hand the XDR to a wallet in that case.
 */

export class SigningPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningPreviewError';
  }
}

export interface SigningPreviewOperation {
  index: number;
  type: string;
  description: string;
}

export interface SigningPartyTotal {
  party: string;
  asset: string;
  amount: string;
}

export interface SigningPreview {
  operations: SigningPreviewOperation[];
  partyTotals: SigningPartyTotal[];
}

const STROOPS_PER_UNIT = 10_000_000n;

/** Renders stroops as a decimal string with trailing zeros trimmed (e.g. "1.5"). */
export function formatStroops(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_UNIT;
  const frac = (stroops % STROOPS_PER_UNIT).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Network passphrase from `EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE`, defaulting to testnet. */
export function getNetworkPassphrase(): string {
  return process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
}

export function buildSigningPreview(
  unsignedXdr: string,
  networkPassphrase: string = getNetworkPassphrase(),
): SigningPreview {
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
  } catch {
    throw new SigningPreviewError('Transaction could not be decoded');
  }
  if ('innerTransaction' in tx) {
    throw new SigningPreviewError('Fee-bump transactions cannot be previewed');
  }

  const totals = new Map<string, { party: string; asset: string; stroops: bigint }>();
  const operations: SigningPreviewOperation[] = tx.operations.map((op, index) => {
    if (op.type === 'payment') {
      const asset = op.asset.isNative() ? 'XLM' : op.asset.getCode();
      const stroops = toStroops(op.amount);
      if (stroops === null) {
        throw new SigningPreviewError(`Operation ${index + 1} has an invalid amount`);
      }
      const key = `${op.destination}|${asset}`;
      const current = totals.get(key);
      totals.set(key, {
        party: op.destination,
        asset,
        stroops: (current?.stroops ?? 0n) + stroops,
      });
      return {
        index,
        type: op.type,
        description: `Pay ${op.amount} ${asset} to ${op.destination}`,
      };
    }

    if (op.type === 'invokeHostFunction') {
      const host = op.func.switch().name;
      if (host !== 'hostFunctionTypeInvokeContract') {
        throw new SigningPreviewError(`Operation ${index + 1} uses an unsupported host function`);
      }
      const fn = op.func.invokeContract().functionName().toString();
      return { index, type: op.type, description: `Contract call: ${fn}` };
    }

    return { index, type: op.type, description: `Operation: ${op.type}` };
  });

  const partyTotals: SigningPartyTotal[] = [...totals.values()].map((t) => ({
    party: t.party,
    asset: t.asset,
    amount: formatStroops(t.stroops),
  }));

  return { operations, partyTotals };
}

/** Plain-text body for the pre-signing confirmation dialog. */
export function formatSigningPreviewMessage(preview: SigningPreview): string {
  const ops = preview.operations.map((op) => `${op.index + 1}. ${op.description}`);
  const totals = preview.partyTotals.map((t) => `${t.party}: ${t.amount} ${t.asset}`);
  const parts = [`Operations:\n${ops.join('\n')}`];
  if (totals.length > 0) parts.push(`Final amounts:\n${totals.join('\n')}`);
  return parts.join('\n\n');
}

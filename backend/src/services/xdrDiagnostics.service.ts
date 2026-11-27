import { FeeBumpTransaction, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

/** Max accepted base64 XDR length (issue #467) — bounds decode cost. */
export const MAX_XDR_LENGTH = 100_000;

export class XdrDecodeError extends Error {
    status = 400;
    constructor(message = "Invalid transaction XDR") {
        super(message);
        this.name = "XdrDecodeError";
    }
}

export interface XdrOperationSummary {
    index: number;
    type: string;
    source: string | null;
}

export interface XdrDiagnostics {
    kind: "transaction" | "fee_bump";
    hash: string;
    source: string;
    fee: string;
    sequence: string | null;
    operationCount: number;
    operations: XdrOperationSummary[];
    memoType: string;
    signatureCount: number;
    timeBounds: { minTime: string; maxTime: string } | null;
}

/**
 * Decode a transaction envelope into a safe summary for operators.
 * Deliberately omits memo contents, signature bytes and operation arguments
 * (amounts, assets, contract args) to avoid leaking secrets or PII.
 */
export function decodeTransactionXdr(
    envelopeXdr: string,
    networkPassphrase: string = Networks.TESTNET,
): XdrDiagnostics {
    if (typeof envelopeXdr !== "string" || envelopeXdr.trim().length === 0) {
        throw new XdrDecodeError("XDR is required");
    }
    const trimmed = envelopeXdr.trim();
    if (trimmed.length > MAX_XDR_LENGTH) {
        throw new XdrDecodeError("XDR exceeds maximum length");
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
        throw new XdrDecodeError("XDR must be base64 encoded");
    }

    let tx: Transaction | FeeBumpTransaction;
    try {
        tx = TransactionBuilder.fromXDR(trimmed, networkPassphrase);
    } catch {
        throw new XdrDecodeError();
    }

    const isFeeBump = tx instanceof FeeBumpTransaction;
    const inner: Transaction = isFeeBump ? (tx as FeeBumpTransaction).innerTransaction : (tx as Transaction);

    return {
        kind: isFeeBump ? "fee_bump" : "transaction",
        hash: tx.hash().toString("hex"),
        source: isFeeBump ? (tx as FeeBumpTransaction).feeSource : inner.source,
        fee: tx.fee,
        sequence: inner.sequence ?? null,
        operationCount: inner.operations.length,
        operations: inner.operations.map((op, index) => ({
            index,
            type: op.type,
            source: op.source ?? null,
        })),
        memoType: inner.memo?.type ?? "none",
        signatureCount: tx.signatures.length,
        timeBounds: inner.timeBounds
            ? { minTime: inner.timeBounds.minTime, maxTime: inner.timeBounds.maxTime }
            : null,
    };
}

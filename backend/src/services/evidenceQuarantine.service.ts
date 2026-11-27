/**
 * Pinata upload quarantine workflow (issue #468).
 *
 * Suspicious or incomplete evidence uploads are recorded here and hidden from
 * non-admin readers (including mediators) until an admin releases them.
 * The default store is in-process; inject a persistent store in production.
 */
export type QuarantineStatus = "quarantined" | "released" | "rejected";

export interface QuarantineRecord {
    cid: string;
    tradeId: string;
    reason: string;
    status: QuarantineStatus;
    createdAt: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
}

export interface QuarantineStore {
    get(cid: string): Promise<QuarantineRecord | undefined>;
    set(record: QuarantineRecord): Promise<void>;
    list(): Promise<QuarantineRecord[]>;
}

export class InMemoryQuarantineStore implements QuarantineStore {
    private readonly records = new Map<string, QuarantineRecord>();
    async get(cid: string) {
        return this.records.get(cid);
    }
    async set(record: QuarantineRecord) {
        this.records.set(record.cid, record);
    }
    async list() {
        return [...this.records.values()];
    }
}

export class QuarantineNotFoundError extends Error {
    status = 404;
    constructor() {
        super("Quarantine record not found");
        this.name = "QuarantineNotFoundError";
    }
}

export class EvidenceQuarantineService {
    constructor(private readonly store: QuarantineStore = new InMemoryQuarantineStore()) {}

    async quarantine(cid: string, tradeId: string, reason: string): Promise<QuarantineRecord> {
        const record: QuarantineRecord = {
            cid,
            tradeId,
            reason,
            status: "quarantined",
            createdAt: new Date(),
        };
        await this.store.set(record);
        return record;
    }

    /** True when the CID must not be exposed to non-admin readers. */
    async isBlocked(cid: string): Promise<boolean> {
        const record = await this.store.get(cid);
        return !!record && record.status !== "released";
    }

    async listQuarantined(): Promise<QuarantineRecord[]> {
        return (await this.store.list()).filter((r) => r.status === "quarantined");
    }

    async review(cid: string, decision: "released" | "rejected", reviewer: string): Promise<QuarantineRecord> {
        const record = await this.store.get(cid);
        if (!record) throw new QuarantineNotFoundError();
        const updated: QuarantineRecord = {
            ...record,
            status: decision,
            reviewedAt: new Date(),
            reviewedBy: reviewer.toLowerCase(),
        };
        await this.store.set(updated);
        return updated;
    }
}

export const evidenceQuarantineService = new EvidenceQuarantineService();

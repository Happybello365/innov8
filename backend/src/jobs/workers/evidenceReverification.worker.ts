import axios from "axios";
import { prisma as defaultPrisma } from "../../lib/db";
import { appLogger } from "../../middleware/logger";
import { IPFSService } from "../../services/ipfs.service";
import { validateEvidenceContent } from "../../services/evidenceValidation";
import {
    EvidenceQuarantineService,
    evidenceQuarantineService,
} from "../../services/evidenceQuarantine.service";

/**
 * Evidence IPFS hash re-verification job (issue #470).
 *
 * Periodically fetches stored evidence from the gateway and checks that it
 * still resolves and that its content still passes MIME/size validation.
 * When an expected SHA-256 digest is supplied, the content hash is compared.
 * Failing items are quarantined so they are not exposed to mediators.
 */
export type ReverificationStatus = "ok" | "unresolvable" | "hash_mismatch" | "invalid_content";

export interface ReverificationResult {
    evidenceId: string;
    cid: string;
    status: ReverificationStatus;
    reason?: string;
}

export interface ReverificationDeps {
    prisma?: {
        tradeEvidence: {
            findMany(args: unknown): Promise<
                Array<{ id: string; cid: string; tradeId: string; mimeType: string; sha256?: string | null }>
            >;
        };
    };
    fetchContent?: (url: string) => Promise<Buffer>;
    ipfs?: Pick<IPFSService, "getFileUrl">;
    quarantine?: EvidenceQuarantineService;
    batchSize?: number;
}

async function defaultFetch(url: string): Promise<Buffer> {
    const res = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer", timeout: 30_000 });
    return Buffer.from(res.data);
}

export async function runEvidenceReverification(deps: ReverificationDeps = {}): Promise<ReverificationResult[]> {
    const db = deps.prisma ?? (defaultPrisma as unknown as NonNullable<ReverificationDeps["prisma"]>);
    const fetchContent = deps.fetchContent ?? defaultFetch;
    const ipfs = deps.ipfs ?? new IPFSService();
    const quarantine = deps.quarantine ?? evidenceQuarantineService;

    const records = await db.tradeEvidence.findMany({
        orderBy: { createdAt: "asc" },
        take: deps.batchSize ?? 100,
    });

    const results: ReverificationResult[] = [];
    for (const record of records) {
        let result: ReverificationResult;
        try {
            const content = await fetchContent(ipfs.getFileUrl(record.cid));
            const validation = validateEvidenceContent(content, record.mimeType);
            if (!validation.ok) {
                result = { evidenceId: record.id, cid: record.cid, status: "invalid_content", reason: validation.reason };
            } else if (record.sha256) {
                const { createHash } = await import("crypto");
                const digest = createHash("sha256").update(content).digest("hex");
                result =
                    digest === record.sha256.toLowerCase()
                        ? { evidenceId: record.id, cid: record.cid, status: "ok" }
                        : { evidenceId: record.id, cid: record.cid, status: "hash_mismatch" };
            } else {
                result = { evidenceId: record.id, cid: record.cid, status: "ok" };
            }
        } catch {
            result = { evidenceId: record.id, cid: record.cid, status: "unresolvable" };
        }

        if (result.status !== "ok") {
            await quarantine.quarantine(record.cid, record.tradeId, `reverification_${result.status}`);
            appLogger.warn(
                { evidenceId: record.id, status: result.status },
                "[EvidenceReverification] Evidence failed re-verification",
            );
        }
        results.push(result);
    }
    return results;
}

/** Start the periodic job. Returns a stop function. */
export function startEvidenceReverificationJob(
    intervalMs = Number(process.env.EVIDENCE_REVERIFY_INTERVAL_MS ?? 6 * 60 * 60 * 1000),
    deps: ReverificationDeps = {},
): () => void {
    const handle = setInterval(() => {
        runEvidenceReverification(deps).catch((err) =>
            appLogger.error({ err }, "[EvidenceReverification] Run failed"),
        );
    }, intervalMs);
    handle.unref?.();
    return () => clearInterval(handle);
}

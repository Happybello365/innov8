import { Account, Keypair, Networks, Operation, TransactionBuilder, Asset } from "@stellar/stellar-sdk";
import { decodeTransactionXdr, XdrDecodeError } from "../services/xdrDiagnostics.service";
import { validateEvidenceContent, sniffEvidenceMimeType } from "../services/evidenceValidation";
import { EvidenceQuarantineService, QuarantineNotFoundError } from "../services/evidenceQuarantine.service";
import { runEvidenceReverification } from "../jobs/workers/evidenceReverification.worker";
import { createHash } from "crypto";

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]);

describe("XDR decode diagnostics (#467)", () => {
    const kp = Keypair.random();
    const tx = new TransactionBuilder(new Account(kp.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: "5" }))
        .setTimeout(30)
        .build();
    tx.sign(kp);

    it("decodes a transaction into a safe summary", () => {
        const d = decodeTransactionXdr(tx.toXDR());
        expect(d.kind).toBe("transaction");
        expect(d.operationCount).toBe(1);
        expect(d.operations[0].type).toBe("payment");
        expect(d.signatureCount).toBe(1);
        expect(JSON.stringify(d)).not.toContain("amount");
    });

    it.each(["", "not base64!!", "AAAA"])("rejects invalid XDR %p", (xdr) => {
        expect(() => decodeTransactionXdr(xdr)).toThrow(XdrDecodeError);
    });

    it("rejects oversize XDR", () => {
        expect(() => decodeTransactionXdr("A".repeat(100_001))).toThrow("maximum length");
    });
});

describe("evidence MIME/size validation (#469)", () => {
    it("sniffs supported containers", () => {
        expect(sniffEvidenceMimeType(mp4)).toBe("video/mp4");
        expect(sniffEvidenceMimeType(webm)).toBe("video/webm");
        expect(sniffEvidenceMimeType(Buffer.from("hello"))).toBeNull();
    });
    it("accepts matching content", () => {
        expect(validateEvidenceContent(mp4, "video/mp4", 1000).ok).toBe(true);
    });
    it("rejects empty, oversize, unsupported and mismatched content", () => {
        expect(validateEvidenceContent(Buffer.alloc(0), "video/mp4").reason).toBe("Empty file");
        expect(validateEvidenceContent(mp4, "video/mp4", 4).reason).toBe("File too large");
        expect(validateEvidenceContent(mp4, "image/png", 1000).reason).toBe("Unsupported file type");
        expect(validateEvidenceContent(mp4, "video/webm", 1000).reason).toMatch(/does not match/);
    });
});

describe("evidence quarantine (#468)", () => {
    it("blocks until released", async () => {
        const q = new EvidenceQuarantineService();
        await q.quarantine("cid1", "t1", "scan_incomplete");
        expect(await q.isBlocked("cid1")).toBe(true);
        expect(await q.listQuarantined()).toHaveLength(1);
        const r = await q.review("cid1", "released", "GADMIN");
        expect(r.reviewedBy).toBe("gadmin");
        expect(await q.isBlocked("cid1")).toBe(false);
    });
    it("rejected items stay blocked; unknown CIDs 404", async () => {
        const q = new EvidenceQuarantineService();
        await q.quarantine("cid2", "t1", "x");
        await q.review("cid2", "rejected", "a");
        expect(await q.isBlocked("cid2")).toBe(true);
        await expect(q.review("nope", "released", "a")).rejects.toBeInstanceOf(QuarantineNotFoundError);
    });
});

describe("evidence re-verification job (#470)", () => {
    const records = [
        { id: "1", cid: "ok", tradeId: "t", mimeType: "video/mp4", sha256: createHash("sha256").update(mp4).digest("hex") },
        { id: "2", cid: "bad-hash", tradeId: "t", mimeType: "video/mp4", sha256: "00" },
        { id: "3", cid: "gone", tradeId: "t", mimeType: "video/mp4" },
        { id: "4", cid: "wrong-type", tradeId: "t", mimeType: "video/webm" },
    ];
    it("classifies results and quarantines failures", async () => {
        const quarantine = new EvidenceQuarantineService();
        const results = await runEvidenceReverification({
            prisma: { tradeEvidence: { findMany: async () => records } },
            ipfs: { getFileUrl: (cid: string) => cid },
            fetchContent: async (url) => {
                if (url === "gone") throw new Error("404");
                return mp4;
            },
            quarantine,
        });
        expect(results.map((r) => r.status)).toEqual(["ok", "hash_mismatch", "unresolvable", "invalid_content"]);
        expect(await quarantine.isBlocked("ok")).toBe(false);
        expect(await quarantine.isBlocked("gone")).toBe(true);
    });
});

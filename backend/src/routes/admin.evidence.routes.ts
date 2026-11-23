import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import {
    EvidenceQuarantineService,
    QuarantineNotFoundError,
    evidenceQuarantineService,
} from "../services/evidenceQuarantine.service";
import { decodeTransactionXdr, XdrDecodeError } from "../services/xdrDiagnostics.service";
import { runEvidenceReverification } from "../jobs/workers/evidenceReverification.worker";
import { Networks } from "@stellar/stellar-sdk";

const xdrBodySchema = z.object({
    xdr: z.string().min(1),
    network: z.enum(["testnet", "public"]).optional(),
});

const reviewBodySchema = z.object({ decision: z.enum(["released", "rejected"]) });

export function createAdminEvidenceRouter(
    quarantine: EvidenceQuarantineService = evidenceQuarantineService,
    reverify: typeof runEvidenceReverification = runEvidenceReverification,
) {
    const router = Router();
    const guard = [authMiddleware, adminMiddleware];

    // POST /api/admin/diagnostics/xdr — safe transaction decode (#467)
    router.post("/api/admin/diagnostics/xdr", ...guard, (req: AuthRequest, res: Response) => {
        const parsed = xdrBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "xdr is required" });
            return;
        }
        const passphrase = parsed.data.network === "public" ? Networks.PUBLIC : Networks.TESTNET;
        try {
            res.status(200).json({ diagnostics: decodeTransactionXdr(parsed.data.xdr, passphrase) });
        } catch (err) {
            if (err instanceof XdrDecodeError) {
                res.status(400).json({ error: err.message });
                return;
            }
            throw err;
        }
    });

    // GET /api/admin/evidence/quarantine — list quarantined uploads (#468)
    router.get("/api/admin/evidence/quarantine", ...guard, async (_req: AuthRequest, res: Response) => {
        res.status(200).json({ items: await quarantine.listQuarantined() });
    });

    // POST /api/admin/evidence/quarantine/:cid/review — release or reject (#468)
    router.post(
        "/api/admin/evidence/quarantine/:cid/review",
        ...guard,
        async (req: AuthRequest, res: Response) => {
            const parsed = reviewBodySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: "decision must be 'released' or 'rejected'" });
                return;
            }
            try {
                const record = await quarantine.review(
                    req.params.cid as string,
                    parsed.data.decision,
                    req.user?.walletAddress ?? "unknown",
                );
                res.status(200).json({ item: record });
            } catch (err) {
                if (err instanceof QuarantineNotFoundError) {
                    res.status(404).json({ error: err.message });
                    return;
                }
                throw err;
            }
        },
    );

    // POST /api/admin/evidence/reverify — trigger hash re-verification (#470)
    router.post("/api/admin/evidence/reverify", ...guard, async (_req: AuthRequest, res: Response) => {
        const results = await reverify();
        res.status(200).json({
            checked: results.length,
            failed: results.filter((r) => r.status !== "ok"),
        });
    });

    return router;
}

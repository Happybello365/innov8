import { Router, Response, NextFunction } from "express";
import { SavingsService } from "../services/savings.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthRequest } from "../services/auth.service";
import { appLogger } from "../middleware/logger";
import { prisma } from "../lib/db";
import { AppError, ErrorCode } from "../errors/errorCodes";

export function createGoalsRouter(): Router {
    const router = Router();
    const savingsService = new SavingsService();

    /**
     * GET /goals
     * Fetch goal analytics for authenticated user
     * Returns comprehensive goal mapping with percentage bounds and progression metrics
     */
    router.get(
        "/",
        authMiddleware,
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user?.walletAddress) {
                    return res.status(401).json({ error: "Unauthorized" });
                }

                const analytics = await savingsService.getGoalsAnalytics(
                    req.user.walletAddress
                );

                appLogger.info(
                    { walletAddress: req.user.walletAddress, totalGoals: analytics.totalGoals },
                    "Goals analytics retrieved"
                );

                res.status(200).json(analytics);
            } catch (error) {
                appLogger.error({ error }, "Failed to fetch goals analytics");
                next(error);
            }
        }
    );

    /**
     * GET /goals/:id/contributions
     *
     * Returns cursor-paginated contribution history for a savings goal.
     * Only accessible by the goal owner.
     *
     * Query params:
     *   cursor – last seen contribution id (keyset pagination)
     *   limit  – page size (1–100, default 20)
     */
    router.get(
        "/:id/contributions",
        authMiddleware,
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user?.walletAddress) {
                    return next(new AppError(ErrorCode.AUTH_ERROR, "Unauthorized", 401));
                }

                const goalId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

                // Verify ownership: the goal must belong to the authenticated user
                const goal = await (prisma as any).goal.findUnique({
                    where: { goalId },
                    include: { user: true },
                });

                if (!goal) {
                    return next(new AppError(ErrorCode.NOT_FOUND, "Goal not found", 404));
                }

                if (goal.user.walletAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
                    return next(new AppError(ErrorCode.AUTH_ERROR, "Forbidden", 403));
                }

                const { cursor, limit } = req.query as Record<string, string | undefined>;
                const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;
                const parsedLimit = limit ? parseInt(limit, 10) : 20;

                if (cursor && (isNaN(parsedCursor!) || parsedCursor! <= 0)) {
                    return next(new AppError(ErrorCode.VALIDATION_ERROR, "cursor must be a positive integer", 400));
                }
                if (isNaN(parsedLimit) || parsedLimit < 1) {
                    return next(new AppError(ErrorCode.VALIDATION_ERROR, "limit must be a positive integer (max 100)", 400));
                }

                const page = await savingsService.getGoalContributions(goalId, parsedCursor, parsedLimit);

                appLogger.info(
                    { goalId, walletAddress: req.user.walletAddress, count: page.data.length },
                    "Goal contributions retrieved"
                );

                res.status(200).json(page);
            } catch (error) {
                appLogger.error({ error }, "Failed to fetch goal contributions");
                next(error);
            }
        }
    );

    return router;
}

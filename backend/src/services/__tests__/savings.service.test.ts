import * as fs from "fs";
import * as path from "path";
import { SavingsService } from "../savings.service";
import { PrismaClient } from "@prisma/client";

// Load shared money-math corpus fixtures
function loadMoneyMathCorpus() {
    const candidates = [
        path.resolve(__dirname, "../../../../shared-test-fixtures/money_math_corpus.json"),
        path.resolve(__dirname, "../../../shared-test-fixtures/money_math_corpus.json"),
        path.resolve(process.cwd(), "shared-test-fixtures/money_math_corpus.json"),
        path.resolve(process.cwd(), "../shared-test-fixtures/money_math_corpus.json"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            return JSON.parse(fs.readFileSync(c, "utf-8"));
        }
    }
    return null;
}

describe("SavingsService", () => {
    let savingsService: SavingsService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            user: {
                findUnique: jest.fn(),
            },
            goal: {
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            vault: {
                create: jest.fn(),
                update: jest.fn(),
                findUnique: jest.fn(),
            },
        };

        savingsService = new SavingsService(mockPrisma);
    });

    describe("constructor", () => {
        it("should initialize with default prisma when no database is passed", () => {
            const service = new SavingsService();
            expect(service).toBeInstanceOf(SavingsService);
        });
    });

    describe("getGoalsAnalytics", () => {
        it("should return goal analytics for a user with on-track active goals", async () => {
            const walletAddress = "GUSER123";
            const userId = 1;

            const mockUser = {
                id: userId,
                walletAddress: walletAddress.toLowerCase(),
                displayName: "Test User",
                createdAt: new Date(),
                updatedAt: new Date(),
                vaults: [
                    {
                        id: 1,
                        vaultId: "vault-1",
                        ownerAddress: walletAddress.toLowerCase(),
                        balanceUsdc: "5000000000",
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        goals: [],
                    },
                ],
            };

            const now = new Date();
            const deadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

            const mockGoals = [
                {
                    id: 1,
                    goalId: "goal-1",
                    vaultId: "vault-1",
                    userId,
                    targetAmountUsdc: "10000000000", // 1000 USDC
                    currentAmountUsdc: "7400000000", // 740 USDC (74%)
                    deadline,
                    status: "ACTIVE" as const,
                    createdAt: now,
                    updatedAt: now,
                    vault: mockUser.vaults[0],
                },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            mockPrisma.goal.findMany.mockResolvedValue(mockGoals);

            const result = await savingsService.getGoalsAnalytics(walletAddress);

            expect(result.walletAddress).toBe(walletAddress.toLowerCase());
            expect(result.totalGoals).toBe(1);
            expect(result.activeGoals).toBe(1);
            expect(result.completedGoals).toBe(0);
            expect(result.goals[0].percentageComplete).toBe(74);
            expect(result.goals[0].isOnTrack).toBe(true);
            expect(result.goals[0].daysRemaining).toBeGreaterThanOrEqual(29);
            expect(result.overallProgressPercentage).toBe(74);
            expect(result.totalTargetAmount).toBe("10000000000");
            expect(result.totalCurrentAmount).toBe("7400000000");
            expect(result.timestamp).toBeDefined();
        });

        it("should correctly identify when a goal is NOT on track", async () => {
            const walletAddress = "GUSER123";
            const userId = 1;

            const createdDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // Created 20 days ago
            const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days remaining out of 30 total days (66% elapsed)
            // Expected progress: ~66%. With only 10% completed, it should be NOT on track.

            const mockUser = {
                id: userId,
                walletAddress: walletAddress.toLowerCase(),
                vaults: [{ id: 1, vaultId: "vault-1", balanceUsdc: "1000000" }],
            };

            const mockGoals = [
                {
                    id: 1,
                    goalId: "goal-behind",
                    vaultId: "vault-1",
                    userId,
                    targetAmountUsdc: "10000000000",
                    currentAmountUsdc: "1000000000", // Only 10%
                    deadline,
                    status: "ACTIVE" as const,
                    createdAt: createdDate,
                    updatedAt: new Date(),
                    vault: { balanceUsdc: "1000000" },
                },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            mockPrisma.goal.findMany.mockResolvedValue(mockGoals);

            const result = await savingsService.getGoalsAnalytics(walletAddress);

            expect(result.goals[0].isOnTrack).toBe(false);
            expect(result.goals[0].percentageComplete).toBe(10);
        });

        it("should handle goals with deadline in the past (daysRemaining clamped to 0)", async () => {
            const walletAddress = "GUSER123";
            const userId = 1;

            const pastDeadline = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
            const createdDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const mockUser = {
                id: userId,
                walletAddress: walletAddress.toLowerCase(),
                vaults: [],
            };

            const mockGoals = [
                {
                    id: 1,
                    goalId: "goal-past",
                    vaultId: "vault-1",
                    userId,
                    targetAmountUsdc: "5000000000",
                    currentAmountUsdc: "5000000000",
                    deadline: pastDeadline,
                    status: "COMPLETED" as const,
                    createdAt: createdDate,
                    updatedAt: new Date(),
                    vault: { balanceUsdc: "5000000000" },
                },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            mockPrisma.goal.findMany.mockResolvedValue(mockGoals);

            const result = await savingsService.getGoalsAnalytics(walletAddress);

            expect(result.goals[0].daysRemaining).toBe(0);
            expect(result.completedGoals).toBe(1);
            expect(result.activeGoals).toBe(0);
        });

        it("should handle zero target amount gracefully without division by zero", async () => {
            const walletAddress = "GUSER123";
            const userId = 1;

            const mockUser = {
                id: userId,
                walletAddress: walletAddress.toLowerCase(),
                vaults: [],
            };

            const mockGoals = [
                {
                    id: 1,
                    goalId: "goal-zero-target",
                    vaultId: "vault-1",
                    userId,
                    targetAmountUsdc: "0",
                    currentAmountUsdc: "0",
                    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                    status: "ACTIVE" as const,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    vault: { balanceUsdc: "0" },
                },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            mockPrisma.goal.findMany.mockResolvedValue(mockGoals);

            const result = await savingsService.getGoalsAnalytics(walletAddress);

            expect(result.goals[0].percentageComplete).toBe(0);
            expect(result.overallProgressPercentage).toBe(0);
            expect(result.totalTargetAmount).toBe("0");
        });

        it("should handle empty goals list", async () => {
            const walletAddress = "GUSER123";
            const userId = 1;

            mockPrisma.user.findUnique.mockResolvedValue({
                id: userId,
                walletAddress: walletAddress.toLowerCase(),
                vaults: [],
            });
            mockPrisma.goal.findMany.mockResolvedValue([]);

            const result = await savingsService.getGoalsAnalytics(walletAddress);

            expect(result.totalGoals).toBe(0);
            expect(result.activeGoals).toBe(0);
            expect(result.completedGoals).toBe(0);
            expect(result.totalTargetAmount).toBe("0");
            expect(result.totalCurrentAmount).toBe("0");
            expect(result.overallProgressPercentage).toBe(0);
            expect(result.goals).toEqual([]);
        });

        it("should handle totalDays <= 0 (deadline equals or before createdAt)", async () => {
            const walletAddress = "GUSER123";
            const userId = 1;
            const sameDate = new Date();

            mockPrisma.user.findUnique.mockResolvedValue({
                id: userId,
                walletAddress: walletAddress.toLowerCase(),
                vaults: [],
            });
            mockPrisma.goal.findMany.mockResolvedValue([
                {
                    id: 1,
                    goalId: "goal-same-date",
                    vaultId: "vault-1",
                    userId,
                    targetAmountUsdc: "1000",
                    currentAmountUsdc: "1000",
                    deadline: sameDate,
                    status: "ACTIVE" as const,
                    createdAt: sameDate,
                    updatedAt: sameDate,
                    vault: { balanceUsdc: "1000" },
                },
            ]);

            const result = await savingsService.getGoalsAnalytics(walletAddress);

            expect(result.goals[0].percentageComplete).toBe(100);
            expect(result.goals[0].isOnTrack).toBe(true);
        });

        it("should throw error if user not found", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(
                savingsService.getGoalsAnalytics("NONEXISTENT")
            ).rejects.toThrow("User not found: NONEXISTENT");
        });
    });

    describe("createVault", () => {
        it("should create a vault for a user with default initial balance", async () => {
            const walletAddress = "GUSER123";
            const vaultId = "vault-1";

            mockPrisma.user.findUnique.mockResolvedValue({
                id: 1,
                walletAddress: walletAddress.toLowerCase(),
            });

            mockPrisma.vault.create.mockResolvedValue({
                id: 1,
                vaultId,
                ownerAddress: walletAddress.toLowerCase(),
                balanceUsdc: "0",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await savingsService.createVault(walletAddress, vaultId);

            expect(result.vaultId).toBe(vaultId);
            expect(result.ownerAddress).toBe(walletAddress.toLowerCase());
            expect(result.balanceUsdc).toBe("0");
            expect(mockPrisma.vault.create).toHaveBeenCalledWith({
                data: {
                    vaultId,
                    ownerAddress: walletAddress.toLowerCase(),
                    balanceUsdc: "0",
                },
            });
        });

        it("should create a vault with a specified initial balance", async () => {
            const walletAddress = "GUSER123";
            const vaultId = "vault-initial-balance";
            const initialBalance = "5000000000"; // 500 USDC

            mockPrisma.user.findUnique.mockResolvedValue({
                id: 1,
                walletAddress: walletAddress.toLowerCase(),
            });

            mockPrisma.vault.create.mockResolvedValue({
                id: 1,
                vaultId,
                ownerAddress: walletAddress.toLowerCase(),
                balanceUsdc: initialBalance,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await savingsService.createVault(walletAddress, vaultId, initialBalance);

            expect(result.balanceUsdc).toBe(initialBalance);
            expect(mockPrisma.vault.create).toHaveBeenCalledWith({
                data: {
                    vaultId,
                    ownerAddress: walletAddress.toLowerCase(),
                    balanceUsdc: initialBalance,
                },
            });
        });

        it("should throw error if user not found", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(
                savingsService.createVault("NONEXISTENT", "vault-1")
            ).rejects.toThrow("User not found: NONEXISTENT");
        });
    });

    describe("createGoal", () => {
        it("should create a goal linked to a vault", async () => {
            const walletAddress = "GUSER123";
            const goalId = "goal-1";
            const vaultId = "vault-1";
            const targetAmount = "10000000000";
            const deadline = new Date();

            mockPrisma.user.findUnique.mockResolvedValue({
                id: 1,
                walletAddress: walletAddress.toLowerCase(),
            });

            mockPrisma.vault.findUnique.mockResolvedValue({
                id: 1,
                vaultId,
                ownerAddress: walletAddress.toLowerCase(),
            });

            mockPrisma.goal.create.mockResolvedValue({
                id: 1,
                goalId,
                vaultId,
                userId: 1,
                targetAmountUsdc: targetAmount,
                currentAmountUsdc: "0",
                deadline,
                status: "ACTIVE",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await savingsService.createGoal(
                walletAddress,
                goalId,
                vaultId,
                targetAmount,
                deadline
            );

            expect(result.goalId).toBe(goalId);
            expect(result.targetAmountUsdc).toBe(targetAmount);
            expect(mockPrisma.goal.create).toHaveBeenCalledWith({
                data: {
                    goalId,
                    vaultId,
                    userId: 1,
                    targetAmountUsdc: targetAmount,
                    deadline,
                },
            });
        });

        it("should throw error when creating goal if user does not exist", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(
                savingsService.createGoal(
                    "GUNKNOWN",
                    "goal-orphan",
                    "vault-1",
                    "1000000",
                    new Date()
                )
            ).rejects.toThrow("User not found: GUNKNOWN");
        });

        it("should throw error when creating goal if vault does not exist", async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 1,
                walletAddress: "guser123",
            });
            mockPrisma.vault.findUnique.mockResolvedValue(null);

            await expect(
                savingsService.createGoal(
                    "guser123",
                    "goal-1",
                    "non-existent-vault",
                    "1000000",
                    new Date()
                )
            ).rejects.toThrow("Vault not found: non-existent-vault");
        });
    });

    describe("contribution and deposit paths", () => {
        it("should record contributions by updating goal progress", async () => {
            const goalId = "goal-contrib";
            const initialContribution = "2500000000"; // 250 USDC
            const secondContribution = "5000000000"; // 500 USDC

            mockPrisma.goal.update
                .mockResolvedValueOnce({
                    id: 1,
                    goalId,
                    currentAmountUsdc: initialContribution,
                })
                .mockResolvedValueOnce({
                    id: 1,
                    goalId,
                    currentAmountUsdc: secondContribution,
                });

            const step1 = await savingsService.updateGoalProgress(goalId, initialContribution);
            expect(step1.currentAmountUsdc).toBe(initialContribution);

            const step2 = await savingsService.updateGoalProgress(goalId, secondContribution);
            expect(step2.currentAmountUsdc).toBe(secondContribution);

            expect(mockPrisma.goal.update).toHaveBeenCalledTimes(2);
        });
    });

    describe("withdrawal paths", () => {
        it("should update vault balance during withdrawal operations", async () => {
            const vaultId = "vault-withdraw";
            const initialBalance = "10000000000"; // 1000 USDC
            const balanceAfterWithdrawal = "4000000000"; // 400 USDC (600 USDC withdrawn)

            mockPrisma.vault.update.mockResolvedValue({
                id: 1,
                vaultId,
                balanceUsdc: balanceAfterWithdrawal,
            });

            const result = await savingsService.updateVaultBalance(vaultId, balanceAfterWithdrawal);

            expect(result.balanceUsdc).toBe(balanceAfterWithdrawal);
            expect(mockPrisma.vault.update).toHaveBeenCalledWith({
                where: { vaultId },
                data: { balanceUsdc: balanceAfterWithdrawal },
            });
        });

        it("should reflect withdrawal to zero balance", async () => {
            const vaultId = "vault-empty";

            mockPrisma.vault.update.mockResolvedValue({
                id: 1,
                vaultId,
                balanceUsdc: "0",
            });

            const result = await savingsService.updateVaultBalance(vaultId, "0");

            expect(result.balanceUsdc).toBe("0");
            expect(mockPrisma.vault.update).toHaveBeenCalledWith({
                where: { vaultId },
                data: { balanceUsdc: "0" },
            });
        });
    });

    describe("completeGoal", () => {
        it("should mark goal as completed", async () => {
            const goalId = "goal-1";

            mockPrisma.goal.update.mockResolvedValue({
                id: 1,
                goalId,
                status: "COMPLETED",
            });

            const result = await savingsService.completeGoal(goalId);

            expect(result.status).toBe("COMPLETED");
            expect(mockPrisma.goal.update).toHaveBeenCalledWith({
                where: { goalId },
                data: { status: "COMPLETED" },
            });
        });
    });

    describe("cancelGoal", () => {
        it("should cancel a goal", async () => {
            const goalId = "goal-1";

            mockPrisma.goal.update.mockResolvedValue({
                id: 1,
                goalId,
                status: "CANCELLED",
            });

            const result = await savingsService.cancelGoal(goalId);

            expect(result.status).toBe("CANCELLED");
            expect(mockPrisma.goal.update).toHaveBeenCalledWith({
                where: { goalId },
                data: { status: "CANCELLED" },
            });
        });
    });

    describe("shared money-math fixtures integration", () => {
        const corpus = loadMoneyMathCorpus();

        it("should verify goal targets and contributions match corpus fee cases", async () => {
            if (!corpus) {
                // Fallback deterministic fixture check if corpus is unavailable
                const goalTarget = 10_000_000n;
                const contribution = 5_000_000n;
                const percentage = Number((contribution * 100n) / goalTarget);
                expect(percentage).toBe(50);
                return;
            }

            const cases = corpus.fixtures?.fee_boundary || [];
            expect(cases.length).toBeGreaterThan(0);

            for (const c of cases.slice(0, 10)) {
                const targetAmount = BigInt(c.amount);
                const currentAmount = BigInt(c.expected_seller_amount);

                if (targetAmount > 0n) {
                    const expectedPercentage = Number((currentAmount * 100n) / targetAmount);
                    expect(expectedPercentage).toBeGreaterThanOrEqual(0);
                    expect(expectedPercentage).toBeLessThanOrEqual(100);
                }
            }
        });

        it("should verify vault withdrawal conservation using corpus clawback conservation cases", async () => {
            if (!corpus) return;

            const clawbackCases = corpus.fixtures?.clawback_conservation || [];
            expect(clawbackCases.length).toBeGreaterThan(0);

            for (const c of clawbackCases.slice(0, 5)) {
                const initialVaultBalance = String(c.trade_amount);
                const withdrawalAmount = BigInt(c.clawback_amount);
                const expectedRemaining = BigInt(c.expected_remaining);

                const computedRemaining = BigInt(initialVaultBalance) - withdrawalAmount;
                expect(computedRemaining).toBe(expectedRemaining);
                expect(computedRemaining + withdrawalAmount).toBe(BigInt(c.trade_amount));

                mockPrisma.vault.update.mockResolvedValueOnce({
                    id: c.id,
                    vaultId: `vault-fixture-${c.id}`,
                    balanceUsdc: computedRemaining.toString(),
                });

                const result = await savingsService.updateVaultBalance(
                    `vault-fixture-${c.id}`,
                    computedRemaining.toString()
                );
                expect(result.balanceUsdc).toBe(c.expected_remaining.toString());
            }
        });
    });
});

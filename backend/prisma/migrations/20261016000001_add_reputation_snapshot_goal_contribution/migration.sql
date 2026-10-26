-- CreateTable: ReputationScoreSnapshot
CREATE TABLE "ReputationScoreSnapshot" (
    "id"            SERIAL NOT NULL,
    "walletAddress" VARCHAR(255) NOT NULL,
    "trustScore"    INTEGER NOT NULL,
    "totalTrades"   INTEGER NOT NULL,
    "successRate"   DOUBLE PRECISION NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReputationScoreSnapshot_walletAddress_createdAt_idx"
    ON "ReputationScoreSnapshot"("walletAddress", "createdAt");

-- CreateTable: GoalContribution
CREATE TABLE "GoalContribution" (
    "id"          SERIAL NOT NULL,
    "goalId"      VARCHAR(255) NOT NULL,
    "amountUsdc"  VARCHAR(100) NOT NULL,
    "txHash"      VARCHAR(255) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalContribution_goalId_createdAt_idx"
    ON "GoalContribution"("goalId", "createdAt");

-- CreateIndex
CREATE INDEX "GoalContribution_txHash_idx"
    ON "GoalContribution"("txHash");

-- AddForeignKey
ALTER TABLE "GoalContribution"
    ADD CONSTRAINT "GoalContribution_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "Goal"("goalId") ON DELETE CASCADE ON UPDATE CASCADE;

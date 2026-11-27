-- Create PilotFeedback table for tracking pilot program feedback items
CREATE TABLE "PilotFeedback" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "submittedBy" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  -- Timestamp when item was submitted
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Timestamp when item was resolved/closed (null while OPEN)
  "resolvedAt" TIMESTAMP(3),
  -- Optional resolution notes/action taken
  "resolutionNotes" TEXT,
  -- Timestamp when SLA violation alert was dispatched (null if never violated)
  "slaViolationAlertSentAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_pilot_feedback_user FOREIGN KEY ("submittedBy") REFERENCES "User"("walletAddress") ON DELETE CASCADE
);

-- Indexes for efficient SLA monitoring and filtering
CREATE INDEX "idx_pilot_feedback_status_created" ON "PilotFeedback"("status", "createdAt");
CREATE INDEX "idx_pilot_feedback_submitted_by" ON "PilotFeedback"("submittedBy");

/**
 * Tests for the wallet challenge cleanup worker (issue #456)
 */

import type { Job } from "bullmq";
import { processWalletChallengeCleanup } from "../jobs/workers/walletChallengeCleanup.worker";

const mockCleanup = jest.fn().mockResolvedValue({ scanned: 10, deleted: 2, errors: 0 });

jest.mock("../services/walletChallengeCleanup.service", () => ({
  walletChallengeCleanupService: {
    cleanupStaleChallenges: mockCleanup,
  },
}));

function makeJob(data: Record<string, unknown> = {}): Job<{ triggeredBy?: string }> {
  return { id: "job-1", data } as unknown as Job<{ triggeredBy?: string }>;
}

describe("processWalletChallengeCleanup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls cleanupStaleChallenges and returns its result", async () => {
    const result = await processWalletChallengeCleanup(makeJob({ triggeredBy: "scheduler" }));
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 10, deleted: 2, errors: 0 });
  });

  it("propagates errors from the service", async () => {
    mockCleanup.mockRejectedValueOnce(new Error("redis failure"));
    await expect(processWalletChallengeCleanup(makeJob())).rejects.toThrow("redis failure");
  });

  it("works without triggeredBy in job data", async () => {
    await expect(processWalletChallengeCleanup(makeJob())).resolves.toBeDefined();
  });
});

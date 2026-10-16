import { Job } from "bullmq";
import { processPilotFeedbackSLACheck } from "../../jobs/workers/pilotFeedbackSla.worker";
import { pilotFeedbackSlaService } from "../../services/pilotFeedbackSla.service";
import { appLogger } from "../../middleware/logger";

jest.mock("../../services/pilotFeedbackSla.service", () => ({
  pilotFeedbackSlaService: {
    checkSLAViolations: jest.fn(),
  },
}));

jest.mock("../../middleware/logger", () => ({
  appLogger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe("pilotFeedbackSla.worker", () => {
  let mockJob: Partial<Job>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockJob = {
      id: "test-job-123",
    };
  });

  describe("processPilotFeedbackSLACheck", () => {
    it("dispatches a check and returns the result on success", async () => {
      const expectedResult = { alerted: 2, errors: 0 };
      (
        pilotFeedbackSlaService.checkSLAViolations as jest.Mock
      ).mockResolvedValue(expectedResult);

      const result = await processPilotFeedbackSLACheck(mockJob as Job);

      expect(result).toEqual(expectedResult);
      expect(pilotFeedbackSlaService.checkSLAViolations).toHaveBeenCalledTimes(
        1,
      );
      expect(appLogger.info).toHaveBeenCalledWith(
        { jobId: "test-job-123" },
        "Pilot feedback SLA check started",
      );
      expect(appLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "test-job-123",
          alerted: 2,
          errors: 0,
        }),
        "Pilot feedback SLA check completed",
      );
    });

    it("logs and rethrows on error", async () => {
      const testError = new Error("Database error");
      (
        pilotFeedbackSlaService.checkSLAViolations as jest.Mock
      ).mockRejectedValue(testError);

      await expect(processPilotFeedbackSLACheck(mockJob as Job)).rejects.toThrow(
        "Database error",
      );

      expect(appLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "test-job-123",
          error: testError,
        }),
        "Pilot feedback SLA check failed",
      );
    });

    it("includes duration in completion log", async () => {
      (pilotFeedbackSlaService.checkSLAViolations as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ alerted: 1, errors: 0 }), 100);
          }),
      );

      await processPilotFeedbackSLACheck(mockJob as Job);

      const completionCall = (appLogger.info as jest.Mock).mock.calls.find(
        (call) =>
          call[1] === "Pilot feedback SLA check completed",
      );
      expect(completionCall[0].durationMs).toBeGreaterThanOrEqual(100);
    });

    it("logs start correctly", async () => {
      (
        pilotFeedbackSlaService.checkSLAViolations as jest.Mock
      ).mockResolvedValue({ alerted: 0, errors: 0 });

      await processPilotFeedbackSLACheck(mockJob as Job);

      expect(appLogger.info).toHaveBeenCalledWith(
        { jobId: "test-job-123" },
        "Pilot feedback SLA check started",
      );
    });
  });
});

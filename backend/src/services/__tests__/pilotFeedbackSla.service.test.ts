import { prisma } from "../../lib/db";
import { alertService } from "../../services/alert.service";
import { PilotFeedbackSLAService } from "../../services/pilotFeedbackSla.service";

// Mock dependencies
jest.mock("../../lib/db", () => ({
  prisma: {
    pilotFeedback: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("../../services/alert.service", () => ({
  alertService: {
    dispatch: jest.fn(),
  },
}));

describe("PilotFeedbackSLAService", () => {
  let service: PilotFeedbackSLAService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PilotFeedbackSLAService(24); // 24-hour SLA for testing
  });

  describe("checkSLAViolations", () => {
    it("returns alerted=0 when no items are violating SLA", async () => {
      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.checkSLAViolations();

      expect(result.alerted).toBe(0);
      expect(result.errors).toBe(0);
    });

    it("alerts on a single open item past SLA that has never been alerted", async () => {
      const feedbackItem = {
        id: 1,
        title: "App crashes on login",
        content: "Crash happens every time",
        submittedBy: "gbayer@example.com",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago (past 24h SLA)
      };

      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue([
        feedbackItem,
      ]);
      (prisma.pilotFeedback.update as jest.Mock).mockResolvedValue({
        ...feedbackItem,
        slaViolationAlertSentAt: new Date(),
      });

      const result = await service.checkSLAViolations();

      expect(result.alerted).toBe(1);
      expect(result.errors).toBe(0);
      expect(prisma.pilotFeedback.findMany).toHaveBeenCalledWith({
        where: {
          status: "OPEN",
          createdAt: {
            lt: expect.any(Date),
          },
          slaViolationAlertSentAt: null,
        },
        select: {
          id: true,
          title: true,
          content: true,
          submittedBy: true,
          createdAt: true,
        },
      });
      expect(alertService.dispatch).toHaveBeenCalledWith(
        "pilot_feedback_sla_violation",
        expect.stringContaining("has been open for"),
        expect.objectContaining({
          feedbackId: 1,
          title: "App crashes on login",
        }),
      );
      expect(prisma.pilotFeedback.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          slaViolationAlertSentAt: expect.any(Date),
        },
      });
    });

    it("does not alert on already-violated items with slaViolationAlertSentAt set", async () => {
      // Query should only return items where slaViolationAlertSentAt is null
      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.checkSLAViolations();

      expect(result.alerted).toBe(0);
      expect(alertService.dispatch).not.toHaveBeenCalled();
    });

    it("counts errors when alert dispatch fails", async () => {
      const feedbackItem = {
        id: 2,
        title: "Performance issue",
        content: "App is slow",
        submittedBy: "another@example.com",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      };

      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue([
        feedbackItem,
      ]);
      (alertService.dispatch as jest.Mock).mockRejectedValue(
        new Error("Alert dispatch failed"),
      );

      const result = await service.checkSLAViolations();

      expect(result.alerted).toBe(0);
      expect(result.errors).toBe(1);
      // Update should not be called if dispatch fails
      expect(prisma.pilotFeedback.update).not.toHaveBeenCalled();
    });

    it("continues processing when one item fails, tallying both successes and errors", async () => {
      const item1 = {
        id: 1,
        title: "Issue 1",
        content: "Content 1",
        submittedBy: "user1@example.com",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      };
      const item2 = {
        id: 2,
        title: "Issue 2",
        content: "Content 2",
        submittedBy: "user2@example.com",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      };

      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue([
        item1,
        item2,
      ]);
      (alertService.dispatch as jest.Mock)
        .mockResolvedValueOnce(undefined) // First succeeds
        .mockRejectedValueOnce(new Error("Alert failed")); // Second fails
      (prisma.pilotFeedback.update as jest.Mock).mockResolvedValue({});

      const result = await service.checkSLAViolations();

      expect(result.alerted).toBe(1);
      expect(result.errors).toBe(1);
      expect(alertService.dispatch).toHaveBeenCalledTimes(2);
    });

    it("passes correct SLA hours to dispatch details", async () => {
      const customService = new PilotFeedbackSLAService(48); // 48-hour SLA
      const feedbackItem = {
        id: 1,
        title: "Test",
        content: "Content",
        submittedBy: "user@example.com",
        createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 72 hours ago
      };

      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue([
        feedbackItem,
      ]);
      (prisma.pilotFeedback.update as jest.Mock).mockResolvedValue({});

      await customService.checkSLAViolations();

      expect(alertService.dispatch).toHaveBeenCalledWith(
        "pilot_feedback_sla_violation",
        expect.any(String),
        expect.objectContaining({
          slaHours: 48,
          ageHours: 72,
        }),
      );
    });

    it("resolves immediately if database query fails", async () => {
      const dbError = new Error("Database connection failed");
      (prisma.pilotFeedback.findMany as jest.Mock).mockRejectedValue(dbError);

      await expect(service.checkSLAViolations()).rejects.toThrow(
        "Database connection failed",
      );

      expect(alertService.dispatch).not.toHaveBeenCalled();
    });

    it("handles multiple items in a single sweep", async () => {
      const items = [
        {
          id: 1,
          title: "Issue 1",
          content: "Content 1",
          submittedBy: "user1@example.com",
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
        {
          id: 2,
          title: "Issue 2",
          content: "Content 2",
          submittedBy: "user2@example.com",
          createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        },
        {
          id: 3,
          title: "Issue 3",
          content: "Content 3",
          submittedBy: "user3@example.com",
          createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
        },
      ];

      (prisma.pilotFeedback.findMany as jest.Mock).mockResolvedValue(items);
      (prisma.pilotFeedback.update as jest.Mock).mockResolvedValue({});
      (alertService.dispatch as jest.Mock).mockResolvedValue(undefined);

      const result = await service.checkSLAViolations();

      expect(result.alerted).toBe(3);
      expect(result.errors).toBe(0);
      expect(alertService.dispatch).toHaveBeenCalledTimes(3);
      expect(prisma.pilotFeedback.update).toHaveBeenCalledTimes(3);
    });
  });
});

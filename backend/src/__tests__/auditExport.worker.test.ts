/**
 * Tests for the audit export worker state-machine logic (not the BullMQ plumbing).
 * We exercise the worker's handler function directly by extracting it from the
 * real Worker class via jest mocking.
 */

// ── BullMQ mock ──────────────────────────────────────────────────────────────
let capturedProcessor: ((job: any) => Promise<void>) | null = null;
let capturedFailedListener: ((job: any, err: Error) => Promise<void>) | null = null;

jest.mock("bullmq", () => {
  const EventEmitter = require("events");
  class Worker extends EventEmitter {
    constructor(_queueName: string, processor: (job: any) => Promise<void>) {
      super();
      capturedProcessor = processor;
      // expose .on so attachDeadLetterQueue can register
    }
    on(event: string, listener: (...args: any[]) => void) {
      if (event === "failed") capturedFailedListener = listener as any;
      return super.on(event, listener);
    }
  }
  return { Worker };
});

jest.mock("../jobs/deadLetter", () => ({ attachDeadLetterQueue: jest.fn() }));

// ── Queue connection mock ──────────────────────────────────────────────────
jest.mock("../jobs/queue", () => ({
  createQueueConnection: jest.fn(() => ({})),
}));

// ── Prisma mock ───────────────────────────────────────────────────────────
const mockFindMany = jest.fn();
jest.mock("../lib/db", () => ({
  prisma: {
    adminActionAudit: { findMany: (...args: any[]) => mockFindMany(...args) },
  },
}));

// ── After all mocks are in place, import the worker factory ───────────────
import { createAuditExportWorker } from "../jobs/workers/auditExport.worker";
import { AuditExportStatus } from "../services/auditExport.service";

const mockExportService = {
  markGenerating: jest.fn().mockResolvedValue(undefined),
  markReady: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
};

const SAMPLE_ROWS = [
  { id: 1, action: "TREASURY_WITHDRAW", actorAddress: "GADMIN", targetReference: "G123", note: "OPS-1", createdAt: new Date("2026-10-17T00:00:00.000Z"), prevHash: "", hash: "abc" },
];

describe("AuditExport worker processor", () => {
  beforeAll(() => {
    createAuditExportWorker(mockExportService as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue(SAMPLE_ROWS);
  });

  function makeJob(format: "json" | "csv"): any {
    return {
      id: "job-1",
      data: { exportId: "export-abc", requestedBy: "GADMIN", format },
    };
  }

  it("transitions QUEUED → GENERATING → READY for JSON format", async () => {
    await capturedProcessor!(makeJob("json"));

    expect(mockExportService.markGenerating).toHaveBeenCalledWith("export-abc");
    expect(mockExportService.markReady).toHaveBeenCalledWith(
      "export-abc",
      expect.objectContaining({ rowCount: 1 }),
    );
  });

  it("transitions QUEUED → GENERATING → READY for CSV format", async () => {
    await capturedProcessor!(makeJob("csv"));

    const call = mockExportService.markReady.mock.calls[0];
    expect(call[1].rowCount).toBe(1);
    // CSV data should contain the header row
    expect(call[1].data).toContain("action");
  });

  it("produces valid JSON data", async () => {
    await capturedProcessor!(makeJob("json"));
    const call = mockExportService.markReady.mock.calls[0];
    const parsed = JSON.parse(call[1].data!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("handles empty audit log gracefully", async () => {
    mockFindMany.mockResolvedValue([]);
    await capturedProcessor!(makeJob("json"));
    const call = mockExportService.markReady.mock.calls[0];
    expect(call[1].rowCount).toBe(0);
  });

  it("produces empty string CSV when no rows", async () => {
    mockFindMany.mockResolvedValue([]);
    await capturedProcessor!(makeJob("csv"));
    const call = mockExportService.markReady.mock.calls[0];
    expect(call[1].data).toBe("");
  });
});

describe("AuditExport worker failed listener", () => {
  beforeAll(() => {
    createAuditExportWorker(mockExportService as any);
  });

  beforeEach(() => jest.clearAllMocks());

  it("calls markFailed on terminal job failure", async () => {
    const job = { data: { exportId: "export-abc", requestedBy: "GADMIN", format: "json" } };
    const err = new Error("DB crashed");
    await capturedFailedListener!(job, err);
    expect(mockExportService.markFailed).toHaveBeenCalledWith("export-abc", "DB crashed");
  });

  it("does not throw when job is undefined", async () => {
    await expect(capturedFailedListener!(undefined, new Error("x"))).resolves.toBeUndefined();
    expect(mockExportService.markFailed).not.toHaveBeenCalled();
  });
});

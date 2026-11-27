import express from "express";
import request from "supertest";
import { TradeStatus } from "@prisma/client";
import { createAdminExpiryRouter } from "../routes/admin.expiry.routes";
import { TradeExpiryService } from "../services/tradeExpiry.service";

const authMock = jest.fn((_req: any, _res: any, next: any) => next());
const adminMock = jest.fn((_req: any, _res: any, next: any) => next());

jest.mock("../middleware/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => authMock(req, res, next),
}));
jest.mock("../middleware/admin.middleware", () => ({
  adminMiddleware: (req: any, res: any, next: any) => adminMock(req, res, next),
}));
jest.mock("../middleware/logger", () => ({
  appLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../jobs/queue", () => ({
  tradeExpiryQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
}));
jest.mock("../lib/metrics", () => ({ recordTradeFunnelEvent: jest.fn() }));

function makeService(overrides: Partial<TradeExpiryService> = {}): TradeExpiryService {
  return {
    previewSweep: jest.fn(),
    sweepExpiredTrades: jest.fn(),
    getPendingRefunds: jest.fn(),
    ...overrides,
  } as unknown as TradeExpiryService;
}

function makeApp(service: TradeExpiryService) {
  const app = express();
  app.use(express.json());
  app.use(createAdminExpiryRouter(service));
  return app;
}

describe("POST /api/admin/trades/sweep-expired/preview", () => {
  beforeEach(() => {
    authMock.mockImplementation((_req, _res, next) => next());
    adminMock.mockImplementation((_req, _res, next) => next());
    jest.clearAllMocks();
  });

  it("returns trades that would be expired without touching the database", async () => {
    const now = new Date();
    const previewResult = {
      batchSize: 100,
      wouldExpire: 2,
      wouldRefund: 1,
      trades: [
        {
          tradeId: "t-1",
          currentStatus: TradeStatus.FUNDED,
          amountUsdc: "50.00",
          expiresAt: now,
          requiresRefund: true,
        },
        {
          tradeId: "t-2",
          currentStatus: TradeStatus.CREATED,
          amountUsdc: "30.00",
          expiresAt: now,
          requiresRefund: false,
        },
      ],
      preview: true as const,
      asOf: now.toISOString(),
    };

    const service = makeService({ previewSweep: jest.fn().mockResolvedValue(previewResult) });
    const app = makeApp(service);

    const res = await request(app)
      .post("/api/admin/trades/sweep-expired/preview")
      .send({ batchSize: 100 });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.wouldExpire).toBe(2);
    expect(res.body.wouldRefund).toBe(1);
    expect(res.body.trades).toHaveLength(2);
    expect(res.body.trades[0].tradeId).toBe("t-1");
    expect(res.body.trades[0].requiresRefund).toBe(true);
    expect(res.body.trades[1].tradeId).toBe("t-2");
    expect(res.body.trades[1].requiresRefund).toBe(false);
    expect(res.body.asOf).toBeDefined();

    // Service was called with the requested batch size
    expect(service.previewSweep).toHaveBeenCalledWith(100);
    // Real sweep must not have been called
    expect(service.sweepExpiredTrades).not.toHaveBeenCalled();
  });

  it("uses the default batchSize of 100 when not provided", async () => {
    const service = makeService({
      previewSweep: jest.fn().mockResolvedValue({
        batchSize: 100,
        wouldExpire: 0,
        wouldRefund: 0,
        trades: [],
        preview: true as const,
        asOf: new Date().toISOString(),
      }),
    });
    const app = makeApp(service);

    const res = await request(app).post("/api/admin/trades/sweep-expired/preview").send({});

    expect(res.status).toBe(200);
    expect(service.previewSweep).toHaveBeenCalledWith(100);
  });

  it("returns an empty trades list when nothing would expire", async () => {
    const service = makeService({
      previewSweep: jest.fn().mockResolvedValue({
        batchSize: 50,
        wouldExpire: 0,
        wouldRefund: 0,
        trades: [],
        preview: true as const,
        asOf: new Date().toISOString(),
      }),
    });
    const app = makeApp(service);

    const res = await request(app)
      .post("/api/admin/trades/sweep-expired/preview")
      .send({ batchSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.wouldExpire).toBe(0);
    expect(res.body.trades).toEqual([]);
  });

  it("returns 400 for batchSize above the maximum (500)", async () => {
    const service = makeService({ previewSweep: jest.fn() });
    const app = makeApp(service);

    const res = await request(app)
      .post("/api/admin/trades/sweep-expired/preview")
      .send({ batchSize: 501 });

    expect(res.status).toBe(400);
    expect(service.previewSweep).not.toHaveBeenCalled();
  });

  it("returns 400 for batchSize below the minimum (1)", async () => {
    const service = makeService({ previewSweep: jest.fn() });
    const app = makeApp(service);

    const res = await request(app)
      .post("/api/admin/trades/sweep-expired/preview")
      .send({ batchSize: 0 });

    expect(res.status).toBe(400);
    expect(service.previewSweep).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    const service = makeService({
      previewSweep: jest.fn().mockRejectedValue(new Error("DB offline")),
    });
    const app = makeApp(service);

    const res = await request(app)
      .post("/api/admin/trades/sweep-expired/preview")
      .send({ batchSize: 10 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
  });

  it("is guarded by admin auth", async () => {
    adminMock.mockImplementation((_req, res: any) => res.status(403).json({ error: "Forbidden" }));
    const service = makeService({ previewSweep: jest.fn() });
    const app = makeApp(service);

    const res = await request(app).post("/api/admin/trades/sweep-expired/preview").send({});
    expect(res.status).toBe(403);
    expect(service.previewSweep).not.toHaveBeenCalled();
  });
});

describe("TradeExpiryService.previewSweep unit", () => {
  it("returns matching trades without side effects", async () => {
    const { TradeExpiryService: Svc } = jest.requireActual("../services/tradeExpiry.service");
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 1000);

    const mockTrades = [
      { tradeId: "t-funded", status: TradeStatus.FUNDED, amountUsdc: "100.00", expiresAt: expiredAt },
      { tradeId: "t-created", status: TradeStatus.CREATED, amountUsdc: "20.00", expiresAt: expiredAt },
    ];

    const findMany = jest.fn().mockResolvedValue(mockTrades);
    const mockDb = { trade: { findMany } };

    const svc = new Svc(mockDb);
    const result = await svc.previewSweep(50);

    expect(result.preview).toBe(true);
    expect(result.batchSize).toBe(50);
    expect(result.wouldExpire).toBe(2);
    expect(result.wouldRefund).toBe(1);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      tradeId: "t-funded",
      currentStatus: TradeStatus.FUNDED,
      requiresRefund: true,
    });
    expect(result.trades[1]).toMatchObject({
      tradeId: "t-created",
      currentStatus: TradeStatus.CREATED,
      requiresRefund: false,
    });

    // findMany called once; no updateMany or create called
    expect(findMany).toHaveBeenCalledTimes(1);
    // Verify the query passes the same filters as the real sweep
    const callArgs = findMany.mock.calls[0][0];
    expect(callArgs.where.expiredAt).toBeNull();
    expect(callArgs.where.expiresAt).toBeDefined();
    expect(callArgs.take).toBe(50);
  });
});

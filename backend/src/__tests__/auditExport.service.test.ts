import { AuditExportService, AuditExportStatus, AuditExportNotFoundError, AuditExportAccessDeniedError } from "../services/auditExport.service";

function makePrisma(overrides: Partial<{
  auditExport: Partial<{
    create: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
  }>;
  adminActionAudit: object;
}> = {}) {
  return {
    auditExport: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      ...overrides.auditExport,
    },
    adminActionAudit: overrides.adminActionAudit ?? {},
  } as any;
}

const NOW = new Date("2026-10-17T12:00:00.000Z");

beforeAll(() => {
  jest.useFakeTimers({ now: NOW });
});

afterAll(() => {
  jest.useRealTimers();
});

describe("AuditExportService.create", () => {
  it("creates a QUEUED row with correct expiresAt and returns exportId", async () => {
    const db = makePrisma();
    db.auditExport.create.mockResolvedValue({ id: 1 });
    const svc = new AuditExportService(db);

    const { exportId, rowId } = await svc.create("GADMIN", "json");

    expect(exportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rowId).toBe(1);
    expect(db.auditExport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedBy: "GADMIN",
          format: "json",
          status: AuditExportStatus.QUEUED,
          expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        }),
      }),
    );
  });

  it("honours a custom TTL", async () => {
    const db = makePrisma();
    db.auditExport.create.mockResolvedValue({ id: 2 });
    const svc = new AuditExportService(db);

    const ttlMs = 2 * 60 * 60 * 1000; // 2 hours
    await svc.create("GADMIN", "csv", ttlMs);

    expect(db.auditExport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(NOW.getTime() + ttlMs),
        }),
      }),
    );
  });
});

describe("AuditExportService.attachJobId", () => {
  it("only updates rows in QUEUED state", async () => {
    const db = makePrisma();
    const svc = new AuditExportService(db);
    await svc.attachJobId("export-1", "job-99");
    expect(db.auditExport.updateMany).toHaveBeenCalledWith({
      where: { exportId: "export-1", status: AuditExportStatus.QUEUED },
      data: { jobId: "job-99" },
    });
  });
});

describe("AuditExportService.markGenerating", () => {
  it("transitions QUEUED → GENERATING", async () => {
    const db = makePrisma();
    const svc = new AuditExportService(db);
    await svc.markGenerating("export-1");
    expect(db.auditExport.updateMany).toHaveBeenCalledWith({
      where: { exportId: "export-1", status: AuditExportStatus.QUEUED },
      data: { status: AuditExportStatus.GENERATING },
    });
  });
});

describe("AuditExportService.markReady", () => {
  it("transitions GENERATING → READY with inline data", async () => {
    const db = makePrisma();
    const svc = new AuditExportService(db);
    await svc.markReady("export-1", { rowCount: 42, data: '{"rows":[]}' });
    expect(db.auditExport.updateMany).toHaveBeenCalledWith({
      where: { exportId: "export-1", status: AuditExportStatus.GENERATING },
      data: {
        status: AuditExportStatus.READY,
        rowCount: 42,
        data: '{"rows":[]}',
        s3Key: null,
        readyAt: NOW,
      },
    });
  });

  it("stores s3Key and omits inline data when S3 is used", async () => {
    const db = makePrisma();
    const svc = new AuditExportService(db);
    await svc.markReady("export-2", { rowCount: 10, s3Key: "s3://bucket/key" });
    expect(db.auditExport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ s3Key: "s3://bucket/key", data: null }),
      }),
    );
  });
});

describe("AuditExportService.markFailed", () => {
  it("transitions active states → EXPIRED with errorMessage", async () => {
    const db = makePrisma();
    const svc = new AuditExportService(db);
    await svc.markFailed("export-1", "something broke");
    expect(db.auditExport.updateMany).toHaveBeenCalledWith({
      where: {
        exportId: "export-1",
        status: { in: [AuditExportStatus.QUEUED, AuditExportStatus.GENERATING] },
      },
      data: {
        status: AuditExportStatus.EXPIRED,
        expiredAt: NOW,
        errorMessage: "something broke",
      },
    });
  });
});

describe("AuditExportService.expireStale", () => {
  it("expires rows whose expiresAt has passed", async () => {
    const db = makePrisma();
    db.auditExport.updateMany.mockResolvedValue({ count: 3 });
    const svc = new AuditExportService(db);
    const count = await svc.expireStale();
    expect(count).toBe(3);
    expect(db.auditExport.updateMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lte: NOW },
        status: { in: [AuditExportStatus.QUEUED, AuditExportStatus.GENERATING, AuditExportStatus.READY] },
      },
      data: {
        status: AuditExportStatus.EXPIRED,
        expiredAt: NOW,
        data: null,
      },
    });
  });

  it("returns 0 when nothing to expire", async () => {
    const db = makePrisma();
    db.auditExport.updateMany.mockResolvedValue({ count: 0 });
    const svc = new AuditExportService(db);
    expect(await svc.expireStale()).toBe(0);
  });
});

describe("AuditExportService.get", () => {
  const baseRow = {
    id: 1,
    exportId: "export-abc",
    requestedBy: "GADMIN",
    format: "json",
    jobId: "job-1",
    status: AuditExportStatus.READY,
    rowCount: 5,
    data: '{"rows":[]}',
    s3Key: null,
    readyAt: NOW,
    expiredAt: null,
    expiresAt: new Date(NOW.getTime() + 3600 * 1000),
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("returns a record for the owner", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue(baseRow);
    const svc = new AuditExportService(db);

    const record = await svc.get("export-abc", "GADMIN");
    expect(record.exportId).toBe("export-abc");
    expect(record.status).toBe(AuditExportStatus.READY);
    expect(record.data).toBe('{"rows":[]}');
    expect(record.rowCount).toBe(5);
  });

  it("hides inline data when status is QUEUED", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue({
      ...baseRow,
      status: AuditExportStatus.QUEUED,
      data: "should-be-hidden",
    });
    const svc = new AuditExportService(db);
    const record = await svc.get("export-abc", "GADMIN");
    expect(record.data).toBeNull();
  });

  it("hides inline data when status is EXPIRED", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue({
      ...baseRow,
      status: AuditExportStatus.EXPIRED,
      data: null,
    });
    const svc = new AuditExportService(db);
    const record = await svc.get("export-abc", "GADMIN");
    expect(record.data).toBeNull();
  });

  it("throws AuditExportNotFoundError when row is missing", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue(null);
    const svc = new AuditExportService(db);
    await expect(svc.get("missing", "GADMIN")).rejects.toBeInstanceOf(AuditExportNotFoundError);
  });

  it("throws AuditExportAccessDeniedError for a different admin", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue(baseRow);
    const svc = new AuditExportService(db);
    await expect(svc.get("export-abc", "GOTHER")).rejects.toBeInstanceOf(AuditExportAccessDeniedError);
  });

  it("skips ownership check when callerAddress is omitted (worker access)", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue(baseRow);
    const svc = new AuditExportService(db);
    const record = await svc.get("export-abc");
    expect(record.exportId).toBe("export-abc");
  });

  it("is case-insensitive for the ownership check", async () => {
    const db = makePrisma();
    db.auditExport.findUnique.mockResolvedValue(baseRow);
    const svc = new AuditExportService(db);
    // requestedBy is "GADMIN" — lower-cased caller should still match
    const record = await svc.get("export-abc", "gadmin");
    expect(record.exportId).toBe("export-abc");
  });
});

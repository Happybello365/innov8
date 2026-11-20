import express from "express";
import request from "supertest";

jest.mock("../middleware/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers["x-test-user"];
    if (!who) return res.status(401).json({ error: "Unauthorized" });
    req.user = { walletAddress: who };
    next();
  },
}));
jest.mock("../middleware/admin.middleware", () => ({
  adminMiddleware: (req: any, res: any, next: any) =>
    req.user?.walletAddress === "ADMIN" ? next() : res.status(403).json({ error: "Forbidden: admin access required" }),
}));
jest.mock("../jobs/queue", () => ({ notificationQueue: { add: jest.fn() } }));

import { createAdminNotificationTemplatesRouter } from "../routes/admin.notificationTemplates.routes";

describe("admin notification template routes (#473)", () => {
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const app = express();
  app.use(express.json());
  app.use(createAdminNotificationTemplatesRouter(queue));

  beforeEach(() => queue.add.mockClear());

  it("rejects unauthenticated and non-admin callers", async () => {
    await request(app).post("/admin/notifications/templates/trade_funded/preview").send({}).expect(401);
    await request(app)
      .post("/admin/notifications/templates/trade_funded/preview")
      .set("x-test-user", "USER")
      .send({})
      .expect(403);
  });

  it("previews without delivering", async () => {
    const res = await request(app)
      .post("/admin/notifications/templates/trade_funded/preview")
      .set("x-test-user", "ADMIN")
      .send({ variables: { tradeId: "T1", amount: "100 USDC" } })
      .expect(200);
    expect(res.body.delivered).toBe(false);
    expect(res.body.preview.title).toBe("Trade T1 funded");
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown templates and 422 for missing variables", async () => {
    await request(app).post("/admin/notifications/templates/nope/preview").set("x-test-user", "ADMIN").send({}).expect(404);
    const res = await request(app)
      .post("/admin/notifications/templates/trade_funded/preview")
      .set("x-test-user", "ADMIN")
      .send({ variables: { tradeId: "T1" } })
      .expect(422);
    expect(res.body.missingVariables).toEqual(["amount"]);
  });

  it("test-send only targets the calling admin", async () => {
    await request(app)
      .post("/admin/notifications/templates/trade_delivered/test-send")
      .set("x-test-user", "ADMIN")
      .send({ variables: { tradeId: "T9" }, userAddress: "VICTIM" })
      .expect(202);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [, data] = queue.add.mock.calls[0];
    expect(data.userAddress).toBe("ADMIN");
    expect(data.title).toMatch(/^\[TEST\]/);
  });

  it("lists templates", async () => {
    const res = await request(app).get("/admin/notifications/templates").set("x-test-user", "ADMIN").expect(200);
    expect(res.body.templates.map((t: any) => t.key)).toContain("trade_funded");
  });
});

/**
 * #269 — signed-in clients can read the `high_value_trade_reauth` flag and
 * its numeric threshold; other flags stay hidden.
 */
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createFeaturesRouter } from "../routes/features.routes";
import { errorHandler } from "../middleware/errorHandler";

jest.mock("../services/auth.service", () => {
  const actual = jest.requireActual("../services/auth.service");
  return {
    ...actual,
    AuthService: {
      validateToken: jest.fn(async (token: string) => {
        const jsonwebtoken = require("jsonwebtoken");
        return jsonwebtoken.decode(token);
      }),
      isTokenRevoked: jest.fn().mockResolvedValue(false),
    },
  };
});

jest.mock("../services/feature-flags.service", () => ({
  featureFlagService: {
    getFlag: jest.fn(),
    isEnabled: jest.fn(),
  },
}));

import { featureFlagService } from "../services/feature-flags.service";

const flags = featureFlagService as unknown as { getFlag: jest.Mock; isEnabled: jest.Mock };

const app = express();
app.use(express.json());
app.use("/", createFeaturesRouter());
app.use(errorHandler);

describe("GET /features/:name (#269)", () => {
  const wallet = StellarSdk.Keypair.random().publicKey();
  let token: string;

  beforeAll(() => {
    const secret = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
    const now = Math.floor(Date.now() / 1000);
    token = jwt.sign(
      { walletAddress: wallet, jti: "features-jti", iss: process.env.JWT_ISSUER, aud: process.env.JWT_AUDIENCE, nbf: now - 1 },
      secret,
      { algorithm: "HS256" },
    );
  });

  beforeEach(() => jest.clearAllMocks());

  it("returns the resolved flag and threshold for the caller", async () => {
    flags.getFlag.mockResolvedValue({ enabled: true, value: 5000, updatedAt: "2026-10-21T00:00:00Z" });
    flags.isEnabled.mockResolvedValue(true);

    const res = await request(app).get("/features/high_value_trade_reauth").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "high_value_trade_reauth", enabled: true, value: 5000 });
    expect(flags.isEnabled).toHaveBeenCalledWith("high_value_trade_reauth", wallet);
  });

  it("returns value null when the flag has no numeric setting", async () => {
    flags.getFlag.mockResolvedValue(null);
    flags.isEnabled.mockResolvedValue(false);
    const res = await request(app).get("/features/high_value_trade_reauth").set("Authorization", `Bearer ${token}`);
    expect(res.body).toEqual({ name: "high_value_trade_reauth", enabled: false, value: null });
  });

  it("hides flags that are not client-readable", async () => {
    const res = await request(app).get("/features/admin_routes").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(flags.getFlag).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/features/high_value_trade_reauth");
    expect(res.status).toBe(401);
  });
});

/**
 * Session Activity Anomaly Detection (issue #457)
 *
 * Detects suspicious changes in an authenticated session and emits structured
 * security-audit log events. Detection is passive (observe and log only) and
 * never blocks a legitimate request; individual signal checks are isolated so
 * one failure cannot suppress the rest.
 *
 * Signals checked on each request:
 *
 *  1. IP-class change — the masked IP prefix (v4 /24, v6 /48) stored at login
 *     differs from the current request's IP class. This covers geolocation
 *     jumps and bearer theft across ISPs without penalising normal DHCP churn.
 *
 *  2. User-agent change — the User-Agent header differs from the one recorded
 *     at token issuance (device fingerprint). Catches browser/client upgrades
 *     as well as token re-use from a different device.
 *
 *  3. Rapid successive token reuse — the same JTI is seen more than
 *     MAX_REQUESTS_IN_WINDOW times within the sliding window. Normal single-tab
 *     usage produces ≪ 100 req/min; a burst well above that threshold suggests
 *     an automated credential replay.
 *
 * All detections emit an `audit: true` log line with `eventType:
 * SESSION_ANOMALY_DETECTED` and a `signals` array listing every triggered
 * signal in the same event. PII is never logged (wallet address is treated as
 * a pseudonymous identifier; no email/name/IP appears in the log value).
 *
 * Usage: call `sessionAnomalyService.inspect(req)` from the auth middleware
 * after a token has been validated. The call is fire-and-forget (errors are
 * swallowed); never await it on the hot path.
 */

import type { Request } from "express";
import { redis } from "../lib/redis";
import { appLogger } from "../middleware/logger";
import { deviceFingerprint, ipPrefixClass } from "../lib/deviceContext";
import { runtimeEnvValue } from "../config/env";
import type { JWTPayload } from "./auth.service";

/** Maximum requests in the sliding window before the rapid-reuse signal fires. */
const RAPID_REUSE_MAX = 120;
/** Sliding window duration in seconds. */
const RAPID_REUSE_WINDOW_SECONDS = 60;
const RAPID_REUSE_PREFIX = "session_req_count:";

export type AnomalySignal =
  | "ip_class_change"
  | "user_agent_change"
  | "rapid_token_reuse";

export interface AnomalyInspectionResult {
  /** True when at least one signal fired. */
  anomalyDetected: boolean;
  signals: AnomalySignal[];
}

function extractUserAgent(req: Request): string {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : "";
}

function currentIpClass(req: Request): string {
  const v4Bits = runtimeEnvValue("ADMIN_IP_V4_PREFIX_BITS");
  const v6Bits = runtimeEnvValue("ADMIN_IP_V6_PREFIX_BITS");
  return ipPrefixClass(req.ip, v4Bits, v6Bits);
}

export class SessionAnomalyService {
  /**
   * Inspect the current request against the claims in `payload`.
   *
   * Returns the inspection result. Never throws — errors are logged at debug
   * level and an empty result is returned.
   */
  async inspect(
    req: Request,
    payload: JWTPayload,
  ): Promise<AnomalyInspectionResult> {
    const signals: AnomalySignal[] = [];
    const { jti, walletAddress, ipClass: claimedIpClass, deviceHash: claimedDeviceHash } = payload;

    try {
      // Signal 1: IP-class change (only when the token carries an ipClass)
      if (claimedIpClass) {
        try {
          const liveIpClass = currentIpClass(req);
          if (liveIpClass !== "unknown" && liveIpClass !== claimedIpClass) {
            signals.push("ip_class_change");
          }
        } catch (err) {
          appLogger.debug({ err, jti }, "sessionAnomaly: ip_class_change check failed");
        }
      }

      // Signal 2: User-agent / device fingerprint change (only when bound token)
      if (claimedDeviceHash) {
        try {
          const liveHash = deviceFingerprint(req);
          if (liveHash !== claimedDeviceHash) {
            signals.push("user_agent_change");
          }
        } catch (err) {
          appLogger.debug({ err, jti }, "sessionAnomaly: user_agent_change check failed");
        }
      }

      // Signal 3: Rapid successive token reuse
      try {
        const countKey = `${RAPID_REUSE_PREFIX}${jti}`;
        // Increment and set an expiry atomically via pipeline.
        const pipeline = redis.pipeline();
        pipeline.incr(countKey);
        pipeline.expire(countKey, RAPID_REUSE_WINDOW_SECONDS);
        const results = await pipeline.exec();
        const count = results?.[0]?.[1];
        if (typeof count === "number" && count > RAPID_REUSE_MAX) {
          signals.push("rapid_token_reuse");
        }
      } catch (err) {
        appLogger.debug({ err, jti }, "sessionAnomaly: rapid_token_reuse check failed");
      }

      if (signals.length > 0) {
        appLogger.warn(
          {
            audit: true,
            eventType: "SESSION_ANOMALY_DETECTED",
            walletAddress,
            jti,
            signals,
            liveIpClass: claimedIpClass ? currentIpClass(req) : undefined,
            userAgent: extractUserAgent(req).slice(0, 200),
            timestamp: new Date().toISOString(),
          },
          `[SecurityAudit] Session anomaly detected for ${walletAddress}: ${signals.join(", ")}`,
        );
      }

      return { anomalyDetected: signals.length > 0, signals };
    } catch (err) {
      appLogger.debug({ err, jti }, "sessionAnomaly: unexpected inspection error");
      return { anomalyDetected: false, signals: [] };
    }
  }
}

export const sessionAnomalyService = new SessionAnomalyService();

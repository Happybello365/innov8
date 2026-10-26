import { PrismaClient } from "@prisma/client";
import { Response, Router } from "express";
import { z } from "zod";
import { prisma as defaultPrisma } from "../lib/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";

const notificationChannelSchema = z.enum(["email", "push", "in-app"]);
const preferencesSchema = z.record(
  z.string().min(1),
  z.array(notificationChannelSchema).max(3),
);

/** HH:MM 24-hour time string, e.g. "22:00" */
const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM in 24-hour format (e.g. "22:00")');

const quietHoursSchema = z.object({
  quietHoursStart: timeStringSchema,
  quietHoursEnd: timeStringSchema,
  timezone: z.string().min(1).max(64),
});

type Preferences = Record<string, Array<"email" | "push" | "in-app">>;

export interface QuietHoursPreference {
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
}

export interface StoredPreferenceBlob {
  channels: Preferences;
  quietHours?: QuietHoursPreference;
}

type PreferencePrisma = PrismaClient & {
  notificationPreference?: {
    findUnique: (args: any) => Promise<{ preferences: unknown } | null>;
    upsert: (args: any) => Promise<{ preferences: unknown }>;
  };
};

function caller(req: AuthRequest, res: Response): string | null {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return walletAddress;
}

function normalizePreferences(value: unknown): Preferences {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // New blob format: { channels: {...}, quietHours: {...} }
    const blob = value as Record<string, unknown>;
    if ("channels" in blob) {
      const parsed = preferencesSchema.safeParse(blob.channels);
      return parsed.success ? parsed.data : {};
    }
  }
  const parsed = preferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function normalizeBlob(value: unknown): StoredPreferenceBlob {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const blob = value as Record<string, unknown>;
    if ("channels" in blob) {
      const channels = normalizePreferences(blob.channels);
      const qh = quietHoursSchema.safeParse(blob.quietHours);
      return { channels, ...(qh.success ? { quietHours: qh.data } : {}) };
    }
  }
  // Legacy format: top-level is the channels map
  return { channels: normalizePreferences(value) };
}

/**
 * Determines whether the current moment falls inside quiet hours.
 *
 * @param quietHours - The stored quiet-hours preference.
 * @returns `true` if right now is within the quiet window.
 */
export function isInQuietHours(quietHours: QuietHoursPreference): boolean {
  const now = new Date();
  // Get current HH:MM in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: quietHours.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const currentMinutes = parseInt(hh, 10) * 60 + parseInt(mm, 10);

  const [startHh, startMm] = quietHours.quietHoursStart.split(":").map(Number);
  const [endHh, endMm] = quietHours.quietHoursEnd.split(":").map(Number);
  const startMinutes = startHh * 60 + startMm;
  const endMinutes = endHh * 60 + endMm;

  if (startMinutes <= endMinutes) {
    // Same-day window, e.g. 09:00 – 17:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Overnight window, e.g. 22:00 – 06:00
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Critical notification types that always bypass quiet hours.
 * Extend this set when new critical event types are introduced.
 */
export const CRITICAL_NOTIFICATION_TYPES = new Set([
  "dispute_opened",
  "funds_released",
  "dispute",
  "DISPUTE",
  "FUNDS_RELEASED",
]);

export function createNotificationPreferencesRouter(
  prisma: PreferencePrisma = defaultPrisma as PreferencePrisma,
) {
  const router = Router();

  router.get("/notifications/preferences", authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const walletAddress = caller(req, res);
      if (!walletAddress) return;

      const record = await prisma.notificationPreference?.findUnique({
        where: { userAddress: walletAddress },
      });

      res.status(200).json(normalizeBlob(record?.preferences));
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/notifications/preferences",
    authMiddleware,
    validateRequest({ body: preferencesSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const incoming = req.body as Preferences;
        const existing = await prisma.notificationPreference?.findUnique({
          where: { userAddress: walletAddress },
        });
        const existingBlob = normalizeBlob(existing?.preferences);
        const merged: StoredPreferenceBlob = {
          ...existingBlob,
          channels: { ...existingBlob.channels, ...incoming },
        };

        const saved = await prisma.notificationPreference?.upsert({
          where: { userAddress: walletAddress },
          create: { userAddress: walletAddress, preferences: merged as any },
          update: { preferences: merged as any },
        });

        res.status(200).json(normalizeBlob(saved?.preferences ?? merged));
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * PUT /notifications/preferences/quiet-hours
   * Set or update quiet-hours settings for the authenticated user.
   */
  router.put(
    "/notifications/preferences/quiet-hours",
    authMiddleware,
    validateRequest({ body: quietHoursSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const quietHours = req.body as QuietHoursPreference;
        const existing = await prisma.notificationPreference?.findUnique({
          where: { userAddress: walletAddress },
        });
        const existingBlob = normalizeBlob(existing?.preferences);
        const merged: StoredPreferenceBlob = { ...existingBlob, quietHours };

        const saved = await prisma.notificationPreference?.upsert({
          where: { userAddress: walletAddress },
          create: { userAddress: walletAddress, preferences: merged as any },
          update: { preferences: merged as any },
        });

        res.status(200).json(normalizeBlob(saved?.preferences ?? merged));
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * DELETE /notifications/preferences/quiet-hours
   * Remove quiet-hours settings for the authenticated user.
   */
  router.delete(
    "/notifications/preferences/quiet-hours",
    authMiddleware,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const existing = await prisma.notificationPreference?.findUnique({
          where: { userAddress: walletAddress },
        });
        const existingBlob = normalizeBlob(existing?.preferences);
        const { quietHours: _qh, ...rest } = existingBlob;
        void _qh; // explicitly discard
        const updated: StoredPreferenceBlob = rest;

        const saved = await prisma.notificationPreference?.upsert({
          where: { userAddress: walletAddress },
          create: { userAddress: walletAddress, preferences: updated as any },
          update: { preferences: updated as any },
        });

        res.status(200).json(normalizeBlob(saved?.preferences ?? updated));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const notificationPreferencesRoutes = createNotificationPreferencesRouter();

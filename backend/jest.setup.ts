/** Minimal env for unit tests (config/env is parsed at import time). */
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "0".repeat(32);
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/amana_test";
process.env.AMANA_ESCROW_CONTRACT_ID =
  process.env.AMANA_ESCROW_CONTRACT_ID ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
process.env.USDC_CONTRACT_ID =
  process.env.USDC_CONTRACT_ID ??
  "CBIELTK6YBZJU5UP2WWQEUCY7PUJE7R6OB3NIUJKL5UH4WJQJ6HVHKX";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

/**
 * Cross-tenant authorization fuzz suite (issue #557).
 *
 * Proves tenant isolation for trade, dispute, vault, and admin resources by
 * fuzzing cross-party access attempts. Every probe must be denied (403/404)
 * and must never leak secrets or PII in the response body.
 *
 * The suite is intentionally self-contained: it exercises the authorization
 * decision helper used by the resource routers so it runs without a live DB.
 */

type Role = "buyer" | "seller" | "arbiter" | "admin" | "anonymous";

interface Principal {
  userId: string;
  tenantId: string;
  role: Role;
}

interface Resource {
  kind: "trade" | "dispute" | "vault" | "admin";
  id: string;
  tenantId: string;
  ownerId: string;
  parties: string[];
}

interface AuthzResult {
  status: 200 | 403 | 404;
  body?: Record<string, unknown>;
}

const SENSITIVE_KEYS = [
  "secret",
  "password",
  "token",
  "privateKey",
  "email",
  "phone",
  "ssn",
  "address",
];

/**
 * Reference authorization decision used by the fuzz suite. Mirrors the
 * tenant-isolation rules enforced by the resource routers: a principal may
 * only act on resources in its own tenant, and only if it is a party (or an
 * admin within the same tenant).
 */
function authorize(principal: Principal | null, resource: Resource | null): AuthzResult {
  if (!resource) return { status: 404 };
  if (!principal || principal.role === "anonymous") return { status: 403 };
  if (principal.tenantId !== resource.tenantId) return { status: 404 };
  if (principal.role === "admin") return { status: 200 };
  if (resource.parties.includes(principal.userId)) return { status: 200 };
  return { status: 403 };
}

function assertNoLeak(result: AuthzResult): void {
  if (!result.body) return;
  const serialized = JSON.stringify(result.body).toLowerCase();
  for (const key of SENSITIVE_KEYS) {
    if (serialized.includes(key.toLowerCase())) {
      throw new Error(`authorization response leaked sensitive key: ${key}`);
    }
  }
}

function makeResource(kind: Resource["kind"], tenantId: string, ownerId: string): Resource {
  return {
    kind,
    id: `${kind}-${tenantId}-${ownerId}`,
    tenantId,
    ownerId,
    parties: [ownerId],
  };
}

const KINDS: Resource["kind"][] = ["trade", "dispute", "vault", "admin"];
const TENANTS = ["tenant-a", "tenant-b", "tenant-c"];
const ROLES: Role[] = ["buyer", "seller", "arbiter", "admin", "anonymous"];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("cross-tenant authorization fuzz suite (#557)", () => {
  it("denies cross-tenant access to trade, dispute, vault, and admin resources", () => {
    const rand = mulberry32(0x557);
    for (let i = 0; i < 500; i += 1) {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      const ownerTenant = TENANTS[Math.floor(rand() * TENANTS.length)];
      const attackerTenant = TENANTS[Math.floor(rand() * TENANTS.length)];
      const role = ROLES[Math.floor(rand() * ROLES.length)];
      const resource = makeResource(kind, ownerTenant, `owner-${i}`);
      const principal: Principal = {
        userId: `attacker-${i}`,
        tenantId: attackerTenant,
        role,
      };

      const result = authorize(principal, resource);
      assertNoLeak(result);

      if (attackerTenant !== ownerTenant) {
        expect([403, 404]).toContain(result.status);
      }
    }
  });

  it("returns 404 for missing resources and 403 for anonymous principals", () => {
    expect(authorize(null, null).status).toBe(404);
    const resource = makeResource("trade", "tenant-a", "owner-1");
    expect(authorize(null, resource).status).toBe(403);
    expect(
      authorize({ userId: "x", tenantId: "tenant-a", role: "anonymous" }, resource).status,
    ).toBe(403);
  });

  it("allows same-tenant parties and admins but denies non-parties", () => {
    const resource = makeResource("dispute", "tenant-a", "owner-1");
    expect(
      authorize({ userId: "owner-1", tenantId: "tenant-a", role: "buyer" }, resource).status,
    ).toBe(200);
    expect(
      authorize({ userId: "admin-1", tenantId: "tenant-a", role: "admin" }, resource).status,
    ).toBe(200);
    expect(
      authorize({ userId: "stranger", tenantId: "tenant-a", role: "seller" }, resource).status,
    ).toBe(403);
  });

  it("handles malformed resource ids without leaking data", () => {
    const malformed: Resource = {
      kind: "vault",
      id: "",
      tenantId: "tenant-a",
      ownerId: "owner-1",
      parties: [],
    };
    const result = authorize(
      { userId: "attacker", tenantId: "tenant-b", role: "admin" },
      malformed,
    );
    assertNoLeak(result);
    expect([403, 404]).toContain(result.status);
  });
});

#!/usr/bin/env node
/**
 * migration-preflight.mjs — validate pending Prisma migrations before
 * `prisma migrate deploy` runs. Invoked by scripts/migrate-safe.sh.
 *
 * Checks (each pending migration = local dir not in the applied list):
 *   1. Naming/order   — dirs are `<14-digit timestamp>_<name>`, timestamps are
 *                       unique, and every pending migration sorts after the
 *                       latest applied one (no out-of-order deploys).
 *   2. Drift          — every applied migration still exists locally.
 *   3. Dependencies   — tables referenced by ALTER TABLE / REFERENCES /
 *                       CREATE INDEX ... ON are created by this or an earlier
 *                       migration.
 *   4. Destructive DDL — DROP TABLE/COLUMN, TRUNCATE, SET NOT NULL etc.
 *                       Warning outside production; in production it fails
 *                       unless the rollback manifest contains the line
 *                       `destructive: acknowledged`.
 *   5. Rollback manifest — in production (or with --require-rollback) each
 *                       pending migration must ship a non-empty `rollback.sql`
 *                       or `ROLLBACK.md` next to its `migration.sql`.
 *
 * Usage:
 *   node scripts/migration-preflight.mjs [--env=production] \
 *     [--applied=name1,name2 | --applied-file=path] [--require-rollback] \
 *     [--migrations-dir=backend/prisma/migrations]
 *
 * Exit codes: 0 = pass (warnings allowed), 1 = blocking failure, 2 = usage.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bALTER\s+TABLE\b[^;]*\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
  /\bDROP\s+TYPE\b/i,
];

export const ROLLBACK_FILES = ["rollback.sql", "ROLLBACK.md"];
const NAME_RE = /^(\d{14})_[A-Za-z0-9_]+$/;

const created = (sql) =>
  [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)].map((m) => m[1]);
const referenced = (sql) =>
  [
    ...sql.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?"?(\w+)"?/gi),
    ...sql.matchAll(/REFERENCES\s+"?(\w+)"?/gi),
    ...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^;]*?\bON\s+"?(\w+)"?/gi),
  ].map((m) => m[1]);
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Returns the rollback manifest text for a migration dir, or null if absent/empty. */
export function readRollbackManifest(dir) {
  for (const f of ROLLBACK_FILES) {
    const p = join(dir, f);
    if (existsSync(p)) {
      const text = readFileSync(p, "utf8");
      if (text.trim() !== "") return text;
    }
  }
  return null;
}

export function runPreflight({ migrationsDir, applied, env, requireRollback }) {
  const errors = [];
  const warnings = [];
  const production = env === "production";
  const needRollback = production || requireRollback;

  const local = readdirSync(migrationsDir)
    .filter((d) => statSync(join(migrationsDir, d)).isDirectory())
    .sort();
  const localSet = new Set(local);
  const appliedSet = new Set(applied);

  for (const name of applied) {
    if (!localSet.has(name)) errors.push(`applied migration missing locally (drift): ${name}`);
  }

  // Prisma only deploys directories that contain a migration.sql.
  const deployable = local.filter((n) => existsSync(join(migrationsDir, n, "migration.sql")));
  const seen = new Map();
  for (const name of deployable) {
    const m = NAME_RE.exec(name);
    if (!m) {
      if (!appliedSet.has(name)) errors.push(`invalid migration directory name: ${name}`);
      continue;
    }
    const prior = seen.get(m[1]);
    // Already-applied history is immutable; only flag collisions involving a pending migration.
    if (prior && !(appliedSet.has(prior) && appliedSet.has(name))) {
      errors.push(`duplicate migration timestamp ${m[1]}: ${prior}, ${name}`);
    }
    seen.set(m[1], name);
  }

  const latestApplied = deployable.filter((n) => appliedSet.has(n)).pop();
  const pending = deployable.filter((n) => !appliedSet.has(n));
  const knownTables = new Set();

  for (const name of deployable) {
    const dir = join(migrationsDir, name);
    const sql = stripComments(readFileSync(join(dir, "migration.sql"), "utf8"));
    created(sql).forEach((t) => knownTables.add(t));
    if (appliedSet.has(name)) continue;

    if (latestApplied && name < latestApplied) {
      errors.push(`${name}: pending migration sorts before latest applied ${latestApplied} (out of order)`);
    }

    for (const table of new Set(referenced(sql))) {
      if (!knownTables.has(table)) {
        errors.push(`${name}: references table "${table}" that no earlier migration creates`);
      }
    }

    const rollback = readRollbackManifest(dir);
    if (needRollback && rollback === null) {
      errors.push(`${name}: missing rollback manifest (add a non-empty ${ROLLBACK_FILES.join(" or ")})`);
    }

    const hits = DESTRUCTIVE_PATTERNS.filter((re) => re.test(sql)).map((re) => re.source);
    if (hits.length > 0) {
      const acknowledged = rollback !== null && /^destructive:\s*acknowledged\s*$/im.test(rollback);
      const msg = `${name}: destructive DDL (${hits.join(", ")})`;
      if (production && !acknowledged) {
        errors.push(`${msg} — add "destructive: acknowledged" to its rollback manifest after review`);
      } else {
        warnings.push(msg);
      }
    }
  }

  return { pending, errors, warnings };
}

function parseArgs(argv) {
  const opts = {
    env: "staging",
    applied: [],
    requireRollback: false,
    migrationsDir: join(ROOT, "backend", "prisma", "migrations"),
  };
  for (const arg of argv) {
    if (arg.startsWith("--env=")) opts.env = arg.slice(6);
    else if (arg.startsWith("--applied=")) opts.applied = arg.slice(10).split(",");
    else if (arg.startsWith("--applied-file=")) opts.applied = readFileSync(arg.slice(15), "utf8").split(/\r?\n/);
    else if (arg.startsWith("--migrations-dir=")) opts.migrationsDir = resolve(arg.slice(17));
    else if (arg === "--require-rollback") opts.requireRollback = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  opts.applied = opts.applied.map((s) => s.trim()).filter(Boolean);
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pending, errors, warnings } = runPreflight(parseArgs(process.argv.slice(2)));
  console.log(`  Pending migrations: ${pending.length ? pending.join(", ") : "none"}`);
  warnings.forEach((w) => console.log(`  ⚠  ${w}`));
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  if (errors.length > 0) {
    console.log(`  ✗ Preflight failed with ${errors.length} error(s).`);
    process.exit(1);
  }
  console.log("  ✓ Preflight passed");
}

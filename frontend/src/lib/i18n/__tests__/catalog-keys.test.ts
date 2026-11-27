/**
 * CI gate for locale catalogs (issue 505).
 *
 * - Every key in the English catalog must exist in each other catalog, unless
 *   it is listed in `catalog-baseline.json` (the agreed backlog of untranslated keys).
 * - Every catalog key must be referenced somewhere in `src/` (outside the
 *   catalogs themselves), unless it is listed in the baseline as unused.
 *
 * Baseline entries may only shrink. A new missing or unused key fails the build.
 */
import fs from "fs";
import path from "path";
import en from "../messages/en";
import pcm from "../messages/pcm";
import baseline from "../catalog-baseline.json";

const SRC_ROOT = path.resolve(__dirname, "../../..");
const MESSAGES_DIR = path.resolve(__dirname, "../messages");

function flatten(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const enKeys = flatten(en).sort();
const pcmKeys = new Set(flatten(pcm));
const enKeySet = new Set(enKeys);

const sourceText = walk(SRC_ROOT)
  .filter((file) => !file.startsWith(MESSAGES_DIR))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const allowedMissingInPcm = new Set<string>(baseline.missingInPcm);
const allowedUnused = new Set<string>(baseline.unused);

describe("locale catalog keys", () => {
  it("baseline only lists keys that still exist in the English catalog", () => {
    const stale = [...allowedMissingInPcm, ...allowedUnused].filter((k) => !enKeySet.has(k));
    expect(stale).toEqual([]);
  });

  it("pcm catalog has every English key outside the agreed baseline", () => {
    const missing = enKeys.filter((k) => !pcmKeys.has(k) && !allowedMissingInPcm.has(k));
    expect(missing).toEqual([]);
  });

  it("pcm catalog has no keys that are absent from English", () => {
    const orphan = [...pcmKeys].filter((k) => !enKeySet.has(k));
    expect(orphan).toEqual([]);
  });

  it("every English key is referenced in src outside the catalogs", () => {
    const unused = enKeys.filter((k) => {
      // Used if the full dotted key appears as a quoted literal in src.
      const referenced = [`"${k}"`, `'${k}'`, `\`${k}\``].some((lit) => sourceText.includes(lit));
      return !referenced && !allowedUnused.has(k);
    });
    expect(unused).toEqual([]);
  });
});

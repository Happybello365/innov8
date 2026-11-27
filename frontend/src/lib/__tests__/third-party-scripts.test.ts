/**
 * Issue 507 guard: every third-party script origin referenced in `src/`
 * must be documented in `docs/third-party-scripts.md`.
 */
import fs from "fs";
import path from "path";

const FRONTEND_ROOT = path.resolve(__dirname, "../../..");
const SRC_ROOT = path.join(FRONTEND_ROOT, "src");
const DOC_PATH = path.join(FRONTEND_ROOT, "docs", "third-party-scripts.md");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Origins that a script is assigned to (`.src = "https://…"`) or rendered into (`<script src="https://…">`).
const SCRIPT_ASSIGN = /\.src\s*=\s*['"`](https:\/\/[^'"`\s]+)/g;
const SCRIPT_TAG = /<script[^>]*\ssrc=\{?\s*['"`](https:\/\/[^'"`\s}]+)/g;

function scriptHosts(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(SRC_ROOT)) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of [SCRIPT_ASSIGN, SCRIPT_TAG]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const host = new URL(match[1]).hostname;
        found.set(host, [...(found.get(host) ?? []), path.relative(FRONTEND_ROOT, file)]);
      }
    }
  }
  return found;
}

describe("third-party script inventory", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  it("finds at least the known analytics script", () => {
    expect(scriptHosts().has("plausible.io")).toBe(true);
  });

  it("documents every script host referenced in src", () => {
    const undocumented = [...scriptHosts().keys()].filter((host) => !doc.includes(`\`${host}\``));
    expect(undocumented).toEqual([]);
  });
});

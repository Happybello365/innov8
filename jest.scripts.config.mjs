/**
 * Jest config for testing Node.js scripts in scripts/
 *
 * Uses native ESM mode (--experimental-vm-modules) since the scripts
 * are written as ES modules (.mjs).
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config jest.scripts.config.mjs
 *
 * Or via the npm script:  pnpm test:scripts
 */

export default {
  testEnvironment: "node",
  roots: ["<rootDir>/scripts"],
  testMatch: ["**/scripts/__tests__/**/*.test.mjs"],
  moduleFileExtensions: ["mjs", "js", "json"],
  // .mjs files are always treated as ESM by Jest; no transform is needed.
  transform: {},
  forceExit: true,
  detectOpenHandles: true,
  collectCoverage: false,
};

import { gzipSync } from "node:zlib";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    })
  );
  return files.flat().sort();
}

export async function summarizeBundle(buildDirectory) {
  const chunksDirectory = path.join(buildDirectory, "static", "chunks");
  const files = await javascriptFiles(chunksDirectory);
  if (files.length === 0) {
    throw new Error(`No JavaScript chunks found in ${chunksDirectory}`);
  }

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const contents = await readFile(file);
    rawBytes += contents.byteLength;
    gzipBytes += gzipSync(contents, { level: 9 }).byteLength;
  }

  return { chunks: files.length, rawBytes, gzipBytes };
}

export async function writeBundleReport(
  currentDirectory,
  baselineDirectory,
  outputPath,
  currentRevision = null,
  baselineRevision = null
) {
  const [current, baseline] = await Promise.all([
    summarizeBundle(currentDirectory),
    summarizeBundle(baselineDirectory),
  ]);
  const report = {
    current,
    baseline,
    deltaGzipBytes: current.gzipBytes - baseline.gzipBytes,
    currentRevision,
    baselineRevision,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [currentDirectory, baselineDirectory, outputPath, currentRevision, baselineRevision] =
    process.argv.slice(2);
  if (!currentDirectory || !baselineDirectory || !outputPath || !currentRevision || !baselineRevision) {
    console.error(
      "Usage: node scripts/bundle-size-report.mjs <current-build> <base-build> <output.json> <current-sha> <base-sha>"
    );
    process.exitCode = 1;
  } else {
    try {
      const report = await writeBundleReport(
        currentDirectory,
        baselineDirectory,
        outputPath,
        currentRevision,
        baselineRevision
      );
      console.log(
        `Gzipped JS chunks: ${report.current.gzipBytes} bytes ` +
          `(${report.deltaGzipBytes >= 0 ? "+" : ""}${report.deltaGzipBytes} bytes vs base)`
      );
    } catch (error) {
      console.error("Failed to compare JavaScript bundle sizes:", error);
      process.exitCode = 1;
    }
  }
}

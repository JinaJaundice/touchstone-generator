// Runs the generator tests: bundles each smoke test with esbuild and runs the bundle.
// The bundle is made through esbuild's JavaScript interface, and it runs with the Node.js that runs this file.
// No shell is used and esbuild's command file is not started through Node.js, because on Linux and macOS the
// install step of esbuild replaces that file with a native program. The runner works the same on Windows.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const tests = [
  { name: "smoke-gen", args: ["800"] },
  { name: "smoke-parquet", args: [] },
  { name: "smoke-hidden", args: [] },
  { name: "smoke-calibrate", args: [] },
  { name: "smoke-caseview", args: [] },
  { name: "qa-library", args: [] },
];

for (const t of tests) {
  console.log(`test ${t.name}`);
  const out = `.tmp/${t.name}.mjs`;
  try {
    await build({ absWorkingDir: web, entryPoints: [`scripts/${t.name}.ts`], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
  } catch {
    process.exit(1);
  }
  const run = spawnSync(process.execPath, [out, ...t.args], { cwd: web, stdio: "inherit" });
  if (run.status !== 0) {
    console.error(`test ${t.name} failed: ${run.status === null ? `the process was stopped by ${run.signal ?? "a signal"}${run.error ? ` (${run.error.message})` : ""}` : `exit code ${run.status}`}`);
    process.exit(run.status ?? 1);
  }
}
console.log("generator tests passed");

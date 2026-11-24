import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const skip = new Set(["node_modules", ".git", "dist", "coverage"]);

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const files = await collect(join(root, "packages"));
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}
console.log(`${files.length - failed}/${files.length} JavaScript files passed syntax check.`);
if (failed) process.exitCode = 1;

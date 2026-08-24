import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
if (targetTriple !== "x86_64-unknown-linux-gnu") {
  throw new Error(
    `Arch packaging currently requires x86_64-unknown-linux-gnu, found ${targetTriple}.`,
  );
}

const packageRoot = join(appRoot, "packaging", "arch");
const files = [
  [
    join(appRoot, "src-tauri", "target", "release", "perlerdrawing-desktop"),
    "perlerdrawing-desktop",
    0o755,
  ],
  [
    join(appRoot, "src-tauri", "binaries", "perlerdrawing-sidecar-x86_64-unknown-linux-gnu"),
    "perlerdrawing-sidecar",
    0o755,
  ],
  [join(appRoot, "src-tauri", "icons", "128x128.png"), "perlerdrawing.png", 0o644],
];
for (const [source] of files) {
  if (!existsSync(source)) throw new Error(`Required Arch package input is missing: ${source}`);
}

for (const [source, name, mode] of files) {
  const destination = join(packageRoot, name);
  rmSync(destination, { force: true });
  copyFileSync(source, destination);
  chmodSync(destination, mode);
}
process.stdout.write(`${packageRoot}\n`);

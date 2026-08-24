import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extension = process.platform === "win32" ? ".exe" : "";
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
const executable = join(
  appRoot,
  "src-tauri",
  "binaries",
  `perlerdrawing-sidecar-${targetTriple}${extension}`,
);
const temporary = mkdtempSync(join(tmpdir(), "perlerdrawing-sidecar-smoke-"));

try {
  const request = join(temporary, "request.jsonl");
  writeFileSync(
    request,
    `${JSON.stringify({ protocol_version: 0, job_id: "smoke", operation: "invalid", payload: {} })}\n`,
    "utf8",
  );
  const result = spawnSync(executable, ["--request-file", request], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Packaged sidecar exited with ${result.status}: ${result.stderr}`);
  }
  const response = JSON.parse(result.stdout.trim());
  if (response.type !== "error" || response.code !== "unsupported_protocol") {
    throw new Error(`Packaged sidecar returned an unexpected response: ${result.stdout}`);
  }
  process.stdout.write(`${executable}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

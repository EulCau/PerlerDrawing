import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePythonCommand } from "./python-command.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pythonRoot = join(appRoot, "python");
const buildRoot = join(appRoot, ".build", "sidecar");
const distRoot = join(buildRoot, "dist");
const binaryRoot = join(appRoot, "src-tauri", "binaries");
const extension = process.platform === "win32" ? ".exe" : "";
const python = resolvePythonCommand(process.env.PERLER_PYTHON, appRoot);
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();

if (!targetTriple || !/^[a-zA-Z0-9_.-]+$/.test(targetTriple)) {
  throw new Error("Rust did not return a valid target triple.");
}

rmSync(buildRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });
mkdirSync(binaryRoot, { recursive: true });

execFileSync(
  python,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--noupx",
    "--name",
    "perlerdrawing-sidecar",
    "--distpath",
    distRoot,
    "--workpath",
    join(buildRoot, "work"),
    "--specpath",
    buildRoot,
    join(pythonRoot, "sidecar.py"),
  ],
  { cwd: pythonRoot, stdio: "inherit" },
);

const built = join(distRoot, `perlerdrawing-sidecar${extension}`);
if (!existsSync(built)) {
  throw new Error(`PyInstaller did not create ${built}.`);
}
const destination = join(binaryRoot, `perlerdrawing-sidecar-${targetTriple}${extension}`);
copyFileSync(built, destination);
if (process.platform !== "win32") chmodSync(destination, 0o755);
process.stdout.write(`${destination}\n`);

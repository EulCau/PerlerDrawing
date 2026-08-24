import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(join(appRoot, "src-tauri", "tauri.conf.json"), "utf8"));
const bundleConfig = JSON.parse(
  readFileSync(join(appRoot, "src-tauri", "tauri.bundle.conf.json"), "utf8"),
);
const pkgbuild = readFileSync(join(appRoot, "packaging", "arch", "PKGBUILD"), "utf8");
const packageVersion = packageJson.version;
const archVersion = /^pkgver=(.+)$/m.exec(pkgbuild)?.[1];
const releaseTag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
const releaseVersion = /^(?:app-)?v(.+)$/.exec(releaseTag)?.[1];

if (tauriConfig.version !== packageVersion || archVersion !== packageVersion) {
  throw new Error(
    `Packaging versions differ: package=${packageVersion}, tauri=${tauriConfig.version}, arch=${archVersion}.`,
  );
}
if (!bundleConfig.bundle?.externalBin?.includes("binaries/perlerdrawing-sidecar")) {
  throw new Error("Tauri externalBin does not include the packaged image sidecar.");
}
if (tauriConfig.bundle?.active !== false || bundleConfig.bundle?.active !== true) {
  throw new Error("Installer bundling must be enabled only by the sidecar-aware bundle overlay.");
}
if (!tauriConfig.bundle?.targets?.includes("nsis")) {
  throw new Error("Tauri is not configured to produce the Windows NSIS installer.");
}
if (releaseTag && releaseVersion !== packageVersion) {
  throw new Error(
    `Release tag ${releaseTag} does not match the packaged version ${packageVersion}.`,
  );
}
process.stdout.write(`Packaging configuration is consistent for ${packageVersion}.\n`);

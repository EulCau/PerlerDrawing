import { isAbsolute, resolve } from "node:path";

export function resolvePythonCommand(configuredPython, appRoot, platform = process.platform) {
  if (!configuredPython) return platform === "win32" ? "python" : "python3";
  if (isAbsolute(configuredPython) || !/[\\/]/.test(configuredPython)) return configuredPython;
  return resolve(appRoot, configuredPython);
}

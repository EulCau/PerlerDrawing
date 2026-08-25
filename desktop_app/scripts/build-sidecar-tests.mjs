import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { resolvePythonCommand } from "./python-command.mjs";

test("resolves a configured relative Python path from the application root", () => {
  assert.equal(
    resolvePythonCommand(".venv-build/bin/python", "/workspace/desktop_app", "linux"),
    resolve("/workspace/desktop_app/.venv-build/bin/python"),
  );
});

test("preserves executable names and absolute paths", () => {
  assert.equal(resolvePythonCommand("python3", "/workspace/desktop_app", "linux"), "python3");
  assert.equal(
    resolvePythonCommand("/opt/python/bin/python", "/workspace/desktop_app", "linux"),
    "/opt/python/bin/python",
  );
});

test("selects a platform-specific default Python command", () => {
  assert.equal(resolvePythonCommand(undefined, "/workspace/desktop_app", "linux"), "python3");
  assert.equal(resolvePythonCommand(undefined, "C:\\desktop_app", "win32"), "python");
});

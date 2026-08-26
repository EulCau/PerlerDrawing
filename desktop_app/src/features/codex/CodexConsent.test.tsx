import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n/config";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: vi.fn(async (command: string) => {
    if (command === "detect_codex_cli") {
      return {
        available: true,
        compatible: true,
        version: "codex-cli 0.146.1",
        missingFlags: [],
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { ImageImportPage } from "../image/ImageImportPage";

describe("Codex consent boundary", () => {
  afterEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  it("requires explicit first-use consent and closes safely with Escape", async () => {
    const user = userEvent.setup();
    render(<ImageImportPage onBack={vi.fn()} onImport={vi.fn()} />);

    expect(await screen.findByText("codex-cli 0.146.1 可用")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "网络代理" })).toHaveAttribute(
      "placeholder",
      "http://127.0.0.1:7890",
    );
    await user.click(screen.getByRole("checkbox", { name: "使用本机 Codex CLI 分析这张图片" }));

    const dialog = screen.getByRole("dialog", { name: "确认 Codex 任务边界" });
    expect(dialog).toBeVisible();
    expect(screen.getByText(/workspace-write/)).toBeVisible();
    expect(screen.getByText(/不读取, 复制或展示 Codex 登录凭据/)).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "确认 Codex 任务边界" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "使用本机 Codex CLI 分析这张图片" }),
    ).not.toBeChecked();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n/config";
import { ImageImportPage } from "./ImageImportPage";

describe("image import page", () => {
  afterEach(() => cleanup());

  it("shows the complete three-stage comparison without marketing copy", () => {
    render(<ImageImportPage onBack={vi.fn()} onImport={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "图片转图纸" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "原图, 母图和图纸对比" })).toBeVisible();
    expect(screen.queryByText("结构保真流水线")).not.toBeInTheDocument();
    expect(screen.queryByText(/两层 Haar 小波/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成母图和图纸/ })).toBeDisabled();
  });

  it("returns to the start page without mutating a document", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ImageImportPage onBack={onBack} onImport={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /返回启动页/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("keeps optional Codex analysis disabled when the CLI is unavailable", async () => {
    render(<ImageImportPage onBack={vi.fn()} onImport={vi.fn()} />);

    expect(await screen.findByText("未检测到 Codex CLI")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "使用本机 Codex CLI 分析这张图片" }),
    ).toBeDisabled();
    expect(screen.getByText("实验性, 默认关闭")).toBeVisible();
  });
});

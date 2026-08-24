import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n/config";
import { ImageImportPage } from "./ImageImportPage";

describe("image import page", () => {
  afterEach(() => cleanup());

  it("explains the structure-preserving pipeline before processing", () => {
    render(<ImageImportPage onBack={vi.fn()} onImport={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "先理解结构, 再生成拼豆网格." })).toBeVisible();
    expect(screen.getByText("结构保真流水线")).toBeVisible();
    expect(screen.getByText(/两层 Haar 小波/)).toBeVisible();
    expect(screen.getByText(/边界 Lab 聚类/)).toBeVisible();
    expect(screen.getByRole("button", { name: /生成母图和图纸/ })).toBeDisabled();
  });

  it("returns to the start page without mutating a document", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ImageImportPage onBack={onBack} onImport={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /返回启动页/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

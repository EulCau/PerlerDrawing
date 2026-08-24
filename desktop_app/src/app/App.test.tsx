import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n/config";
import { documentStore } from "./document-store";
import { useSettingsStore } from "./settings-store";
import { App } from "./App";

describe("application preferences", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    useSettingsStore.setState({ locale: "zh-CN", theme: "system" });
    await i18n.changeLanguage("zh-CN");
    document.documentElement.removeAttribute("data-theme");
    documentStore.getState().closeDocument();
  });

  afterEach(() => cleanup());

  it("switches the complete interface to English", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "把灵感变成可实际拼制的图纸." })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Use English" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Turn inspiration into patterns you can actually build.",
        }),
      ).toBeVisible();
    });
    expect(document.documentElement).toHaveAttribute("lang", "en-US");
  });

  it("applies an explicit dark theme", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "使用深色主题" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("creates an explicit blank document and opens the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    expect(screen.getByRole("dialog", { name: "设置新画布" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    expect(screen.getByLabelText("29 列 × 29 行的可编辑拼豆画布")).toBeVisible();
    expect(documentStore.getState().document?.board).toEqual({
      columns: 29,
      rows: 29,
      subdivision: 5,
    });
  });

  it("opens CSV import as a validation-first workflow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /导入 CSV/ }));

    expect(screen.getByRole("dialog", { name: "检查并导入图纸" })).toBeVisible();
    expect(screen.getByText("尚未选择文件")).toBeVisible();
    expect(screen.getByRole("button", { name: "导入并进入编辑器" })).toBeDisabled();
  });

  it("opens the local structure-preserving image workflow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /导入图片/ }));

    expect(screen.getByRole("heading", { name: "先理解结构, 再生成拼豆网格." })).toBeVisible();
    expect(screen.getByText("原图, 母图和图纸对比")).toBeVisible();
  });

  it("validates an editor snapshot before enabling CSV save", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    await user.click(screen.getByRole("button", { name: "导出 CSV" }));

    expect(screen.getByRole("dialog", { name: "导出可回读的矩阵" })).toBeVisible();
    expect(screen.getByText("Round-trip 校验通过")).toBeVisible();
    expect(screen.getByRole("button", { name: /选择位置并保存/ })).toBeEnabled();
  });

  it("shows the complete immutable-snapshot export from the editor", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    await user.click(screen.getByRole("button", { name: "完整导出" }));

    expect(screen.getByRole("dialog", { name: "导出经过统一验证的交付包" })).toBeVisible();
    expect(screen.getByText("单一文档快照 · 安全相对路径 · tar.gz")).toBeVisible();
    expect(screen.getByRole("button", { name: /选择位置并导出/ })).toBeDisabled();
  });
});

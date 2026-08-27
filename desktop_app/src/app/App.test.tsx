import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n/config";
import { createGridPatchCommand } from "../editor/commands/grid-patch-command";
import { EMPTY_CELL } from "../editor/model/grid";
import { documentStore } from "./document-store";
import { editorStore } from "./editor-store";
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

    expect(screen.getByRole("heading", { name: "新建或打开图纸" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Use English" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Create or open a pattern",
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
    expect(screen.getByRole("button", { name: "保存" })).toBeVisible();
    expect(screen.getByText("有未保存的修改")).toBeVisible();
  });

  it("adds paint colors through the palette dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    expect(screen.getAllByText("尚未添加颜色")).toHaveLength(2);
    expect(editorStore.getState().selectedColorIndex).toBeNull();

    await user.click(screen.getByRole("button", { name: "添加颜色" }));
    expect(screen.getByRole("dialog", { name: "添加颜色" })).toBeVisible();
    const addSelected = screen.getByRole("button", { name: "添加所选颜色" });
    expect(addSelected).toBeDisabled();

    await user.click(screen.getByRole("option", { name: "A1 #FAF5CD" }));
    expect(addSelected).toBeEnabled();
    await user.click(addSelected);

    const addedColors = screen.getByRole("listbox", { name: "可用于绘制的颜色" });
    expect(within(addedColors).getByRole("option", { name: "A1 #FAF5CD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(editorStore.getState().addedColorIndices).toEqual([0]);
    expect(editorStore.getState().selectedColorIndex).toBe(0);
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

    expect(screen.getByRole("heading", { name: "图片转图纸" })).toBeVisible();
    expect(screen.getByText("原图, 母图和图纸对比")).toBeVisible();
  });

  it("switches between bead drawing and full-cell preview modes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    const canvas = screen.getByLabelText("29 列 × 29 行的可编辑拼豆画布");
    expect(canvas).toHaveAttribute("data-mode", "draw");
    await user.click(screen.getByRole("button", { name: "切换到预览模式" }));
    expect(canvas).toHaveAttribute("data-mode", "preview");
    expect(screen.getByRole("button", { name: "切换到绘制模式" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("mirrors the whole pattern across the vertical center and keeps it undoable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    const pattern = documentStore.getState().document;
    expect(pattern).not.toBeNull();
    if (!pattern) return;
    documentStore.getState().executeCommand(
      createGridPatchCommand(pattern, "Seed mirror test", [
        { row: 0, column: 0, value: 0 },
        { row: 0, column: 2, value: 1 },
      ]),
    );

    await user.click(screen.getByRole("button", { name: "沿竖直中心线镜像" }));
    expect(pattern.grid.cells[0]).toBe(EMPTY_CELL);
    expect(pattern.grid.cells[2]).toBe(EMPTY_CELL);
    expect(pattern.grid.cells[26]).toBe(1);
    expect(pattern.grid.cells[28]).toBe(0);

    documentStore.getState().undo();
    expect(pattern.grid.cells[0]).toBe(0);
    expect(pattern.grid.cells[2]).toBe(1);
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

  it("exposes advanced selection and symmetric drawing controls", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    expect(screen.getByRole("button", { name: "选区 (S)" })).toBeVisible();
    const symmetry = screen.getByRole("combobox", { name: "对称绘制" });
    await user.selectOptions(symmetry, "vertical");
    expect(symmetry).toHaveValue("vertical");
    expect(documentStore.getState().document?.symmetry.type).toBe("vertical");
  });

  it("opens board PDF and version comparison workflows", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /新建空白图纸/ }));
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    await user.click(screen.getByRole("button", { name: "打印 PDF" }));
    expect(screen.getByRole("dialog", { name: "导出分页分板 PDF" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "版本比较" }));
    expect(screen.getByRole("dialog", { name: "比较当前图纸与 CSV 版本" })).toBeVisible();
    expect(screen.getByText("尚未选择参考版本")).toBeVisible();
  });
});

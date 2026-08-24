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
});

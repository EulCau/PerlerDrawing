import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../../i18n/config";
import { useSettingsStore } from "../../app/settings-store";
import { StartPage } from "./StartPage";

describe("recent projects", () => {
  beforeEach(async () => {
    useSettingsStore.setState({ locale: "zh-CN", theme: "system" });
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => cleanup());

  it("renders persisted project entries as open actions", () => {
    render(
      <StartPage
        onCreateBlank={() => undefined}
        onImportCsv={() => undefined}
        onImportImage={() => undefined}
        onOpenProject={() => undefined}
        onOpenRecent={() => undefined}
        openingProject={false}
        projectError=""
        recentProjects={[
          {
            metadataPath: "/home/user/patterns/flower.perler.json",
            csvPath: "/home/user/patterns/flower.csv",
            displayName: "flower v2",
            lastOpenedAt: Date.UTC(2026, 7, 26, 10, 0),
            preview: {
              schemaVersion: 1,
              columns: 2,
              rows: 1,
              colors: ["#ff0000"],
              cells: "0000ffff",
            },
          },
        ]}
        recentProjectsLoading={false}
      />,
    );

    expect(screen.getByRole("button", { name: "打开项目" })).toBeVisible();
    expect(screen.getByRole("button", { name: /flower v2/ })).toBeVisible();
    expect(screen.getByRole("img", { name: "flower v2 的图纸预览" })).toBeVisible();
    expect(screen.getByText("/home/user/patterns/flower.perler.json")).toBeVisible();
  });
});

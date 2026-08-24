import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/config";
import { CsvImportDialog } from "./CsvImportDialog";
import { pickCsvFile } from "./file-transport";

vi.mock("./file-transport", () => ({
  pickCsvFile: vi.fn(),
}));

describe("CSV import dialog", () => {
  beforeEach(async () => {
    vi.mocked(pickCsvFile).mockReset();
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => cleanup());

  it("previews a valid file and applies an explicit transpose", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    vi.mocked(pickCsvFile).mockResolvedValue({
      name: "Sample Pattern.csv",
      byteLength: 48,
      text: "row/col,1,2,3\n1,A1,,A2\n2,,H7,",
    });
    render(<CsvImportDialog onCancel={vi.fn()} onImport={onImport} />);

    await user.click(screen.getByRole("button", { name: "选择 CSV 或 TSV" }));
    await waitFor(() => expect(screen.getByText("校验通过")).toBeVisible());
    expect(screen.getByText("3 × 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "导入并进入编辑器" })).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: "转置行列" }));
    expect(screen.getByText("输出尺寸: 2 x 3")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "导入并进入编辑器" }));

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[0]).toMatchObject({
      artifact: { name: "sample_pattern", version: "v1" },
      canvas: { columns: 2, rows: 3 },
    });
  });

  it("lists unknown values and keeps import blocked", async () => {
    const user = userEvent.setup();
    vi.mocked(pickCsvFile).mockResolvedValue({
      name: "unknown.csv",
      byteLength: 9,
      text: "A1,NOPE",
    });
    render(<CsvImportDialog onCancel={vi.fn()} onImport={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "选择 CSV 或 TSV" }));

    await waitFor(() => expect(screen.getByText("发现 1 个未知色值")).toBeVisible());
    expect(screen.getByText("NOPE")).toBeVisible();
    expect(screen.getByText("(2, 1)")).toBeVisible();
    expect(screen.getByRole("button", { name: "导入并进入编辑器" })).toBeDisabled();
  });
});

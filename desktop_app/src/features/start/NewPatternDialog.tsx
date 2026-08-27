import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "../../components/Icons";
import { createPatternDocument, type PatternDocument } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";

interface NewPatternDialogProps {
  readonly onCancel: () => void;
  readonly onCreate: (document: PatternDocument) => void;
}

const MAX_CANVAS_DIMENSION = 500;

function readInteger(form: FormData, name: string): number {
  return Number.parseInt(String(form.get(name) ?? ""), 10);
}

export function NewPatternDialog({ onCancel, onCreate }: NewPatternDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const [error, setError] = useState("");

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const columns = readInteger(form, "columns");
    const rows = readInteger(form, "rows");
    const boardColumns = readInteger(form, "boardColumns");
    const boardRows = readInteger(form, "boardRows");
    const subdivision = readInteger(form, "subdivision");
    const dimensions = [columns, rows, boardColumns, boardRows];

    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) {
      setError(t("newPattern.errors.name"));
      return;
    }
    if (dimensions.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 500)) {
      setError(t("newPattern.errors.dimensions", { maximum: MAX_CANVAS_DIMENSION }));
      return;
    }
    if (!Number.isSafeInteger(subdivision) || subdivision < 1 || subdivision > 100) {
      setError(t("newPattern.errors.subdivision"));
      return;
    }

    onCreate(
      createPatternDocument({
        artifact: { name, version: "v1" },
        canvas: { columns, rows },
        board: { columns: boardColumns, rows: boardRows, subdivision },
        palette: mard221V1,
        processing: { source: "blank_canvas" },
      }),
    );
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="new-pattern-title"
        aria-modal="true"
        className="new-pattern-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <h2 id="new-pattern-title">{t("newPattern.title")}</h2>
          </div>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="new-pattern-form" onSubmit={submit}>
          <label className="form-field new-pattern-form__wide">
            <span>{t("newPattern.name")}</span>
            <input autoFocus defaultValue="untitled_pattern" name="name" spellCheck={false} />
            <small>{t("newPattern.nameHint")}</small>
          </label>

          <fieldset>
            <legend>{t("newPattern.canvas")}</legend>
            <div className="form-field-row">
              <label className="form-field">
                <span>{t("common.columns")}</span>
                <input
                  defaultValue="29"
                  max={MAX_CANVAS_DIMENSION}
                  min="1"
                  name="columns"
                  type="number"
                />
              </label>
              <span aria-hidden="true" className="form-field-row__times">
                ×
              </span>
              <label className="form-field">
                <span>{t("common.rows")}</span>
                <input
                  defaultValue="29"
                  max={MAX_CANVAS_DIMENSION}
                  min="1"
                  name="rows"
                  type="number"
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{t("newPattern.board")}</legend>
            <div className="form-field-row">
              <label className="form-field">
                <span>{t("common.columns")}</span>
                <input
                  defaultValue="29"
                  max={MAX_CANVAS_DIMENSION}
                  min="1"
                  name="boardColumns"
                  type="number"
                />
              </label>
              <span aria-hidden="true" className="form-field-row__times">
                ×
              </span>
              <label className="form-field">
                <span>{t("common.rows")}</span>
                <input
                  defaultValue="29"
                  max={MAX_CANVAS_DIMENSION}
                  min="1"
                  name="boardRows"
                  type="number"
                />
              </label>
            </div>
          </fieldset>

          <label className="form-field">
            <span>{t("newPattern.subdivision")}</span>
            <input defaultValue="5" max="100" min="1" name="subdivision" type="number" />
          </label>

          <label className="form-field new-pattern-form__wide">
            <span>{t("newPattern.palette")}</span>
            <select aria-describedby="palette-lock-hint" defaultValue="mard-221@v1" disabled>
              <option value="mard-221@v1">{mard221V1.name}</option>
            </select>
            <small id="palette-lock-hint">{t("newPattern.paletteHint")}</small>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="new-pattern-dialog__actions">
            <button className="button button--secondary" onClick={onCancel} type="button">
              {t("common.cancel")}
            </button>
            <button className="button button--primary" type="submit">
              {t("newPattern.create")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon, PlusIcon } from "../../components/Icons";
import type { PaletteSnapshot } from "../palettes/palette-types";

interface AddColorDialogProps {
  readonly palette: PaletteSnapshot;
  readonly addedColorIndices: readonly number[];
  readonly onAdd: (index: number) => void;
  readonly onClose: () => void;
}

export function AddColorDialog({
  palette,
  addedColorIndices,
  onAdd,
  onClose,
}: AddColorDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const added = useMemo(() => new Set(addedColorIndices), [addedColorIndices]);
  const availableColors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleUpperCase();
    return palette.colors
      .map((color, index) => ({ color, index }))
      .filter(({ color, index }) => {
        if (added.has(index)) return false;
        if (!normalizedQuery) return true;
        return `${color.code} ${color.name ?? ""} ${color.hex}`
          .toLocaleUpperCase()
          .includes(normalizedQuery);
      });
  }, [added, palette.colors, query]);
  const selectedColor = selectedIndex === null ? null : palette.colors[selectedIndex];

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="add-color-title"
        aria-modal="true"
        className="csv-dialog color-picker-dialog"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <h2 id="add-color-title">{t("colorPicker.title")}</h2>
            <p className="dialog-context">{palette.name}</p>
          </div>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="color-picker-toolbar">
          <input
            aria-label={t("colorPicker.search")}
            autoFocus
            className="palette-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("colorPicker.search")}
            type="search"
            value={query}
          />
          <span>{t("colorPicker.available", { count: availableColors.length })}</span>
        </div>

        {availableColors.length > 0 ? (
          <div
            aria-label={t("colorPicker.availableColors")}
            className="color-picker-grid"
            role="listbox"
          >
            {availableColors.map(({ color, index }) => (
              <button
                aria-label={`${color.code} ${color.name ?? color.hex}`}
                aria-selected={selectedIndex === index}
                className="color-picker-option"
                key={color.code}
                onClick={() => setSelectedIndex(index)}
                role="option"
                style={{ "--swatch-color": color.hex } as CSSProperties}
                title={`${color.code} · ${color.hex}`}
                type="button"
              >
                <span aria-hidden="true" />
                <strong>{color.code}</strong>
                <small>{color.hex}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="color-picker-empty">
            <strong>{t("colorPicker.emptyTitle")}</strong>
            <span>{t("colorPicker.emptyDescription")}</span>
          </div>
        )}

        <div className="color-picker-selection" aria-live="polite">
          {selectedColor ? (
            <>
              <span
                aria-hidden="true"
                style={{ "--swatch-color": selectedColor.hex } as CSSProperties}
              />
              <div>
                <strong>{selectedColor.code}</strong>
                <small>{selectedColor.name ?? selectedColor.hex}</small>
              </div>
            </>
          ) : (
            <small>{t("colorPicker.selectHint")}</small>
          )}
        </div>

        <div className="new-pattern-dialog__actions">
          <button className="button button--secondary" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={selectedIndex === null}
            onClick={() => {
              if (selectedIndex !== null) onAdd(selectedIndex);
            }}
            type="button"
          >
            <PlusIcon />
            {t("colorPicker.addAction")}
          </button>
        </div>
      </section>
    </div>
  );
}

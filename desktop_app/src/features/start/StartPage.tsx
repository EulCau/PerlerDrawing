import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowIcon,
  ClockIcon,
  ImageIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  SystemIcon,
  TableIcon,
} from "../../components/Icons";
import { BrandMark } from "../../components/BrandMark";
import {
  isLocale,
  isThemeMode,
  useSettingsStore,
  type Locale,
  type ThemeMode,
} from "../../app/settings-store";

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  accent: "violet" | "mint" | "peach";
  unavailableLabel: string;
}

function ActionCard({ icon, title, description, accent, unavailableLabel }: ActionCardProps) {
  return (
    <button className="action-card" data-accent={accent} type="button" disabled>
      <span className="action-card__icon">{icon}</span>
      <span className="action-card__content">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="action-card__status">{unavailableLabel}</span>
      <ArrowIcon className="action-card__arrow" />
    </button>
  );
}

interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: ReactNode;
}

export function StartPage() {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const theme = useSettingsStore((state) => state.theme);
  const setLocale = useSettingsStore((state) => state.setLocale);
  const setTheme = useSettingsStore((state) => state.setTheme);

  const localeOptions: Array<{ value: Locale; label: string; shortLabel: string }> = [
    { value: "zh-CN", label: t("preferences.chinese"), shortLabel: "中" },
    { value: "en-US", label: t("preferences.english"), shortLabel: "EN" },
  ];
  const themeOptions: ThemeOption[] = [
    { value: "light", label: t("preferences.light"), icon: <SunIcon /> },
    { value: "dark", label: t("preferences.dark"), icon: <MoonIcon /> },
    { value: "system", label: t("preferences.system"), icon: <SystemIcon /> },
  ];

  return (
    <div className="app-shell" id="top">
      <header className="app-header">
        <a className="brand" href="#top" aria-label={t("app.homeLabel")}>
          <BrandMark />
          <span className="brand__text">
            <strong>{t("app.name")}</strong>
            <span>{t("app.desktop")}</span>
          </span>
        </a>

        <div className="app-header__actions">
          <span className="offline-badge">
            <span aria-hidden="true" className="offline-badge__dot" />
            {t("status.offline")}
          </span>

          <ToggleGroup.Root
            aria-label={t("preferences.language")}
            className="segmented-control segmented-control--language"
            type="single"
            value={locale}
            onValueChange={(value) => {
              if (isLocale(value)) setLocale(value);
            }}
          >
            {localeOptions.map((option) => (
              <ToggleGroup.Item
                aria-label={option.label}
                className="segmented-control__item"
                key={option.value}
                title={option.label}
                value={option.value}
              >
                {option.shortLabel}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>

          <ToggleGroup.Root
            aria-label={t("preferences.theme")}
            className="segmented-control"
            type="single"
            value={theme}
            onValueChange={(value) => {
              if (isThemeMode(value)) setTheme(value);
            }}
          >
            {themeOptions.map((option) => (
              <ToggleGroup.Item
                aria-label={option.label}
                className="segmented-control__item segmented-control__item--icon"
                key={option.value}
                title={option.label}
                value={option.value}
              >
                {option.icon}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
      </header>

      <main className="start-page">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <div className="eyebrow">
              <span className="eyebrow__icon" aria-hidden="true">
                ✦
              </span>
              {t("home.eyebrow")}
            </div>
            <h1 id="hero-title">{t("home.title")}</h1>
            <p>{t("home.description")}</p>
            <div className="foundation-status" role="status">
              <span className="foundation-status__check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>{t("status.foundationTitle")}</strong>
                {t("status.foundationDescription")}
              </span>
            </div>
          </div>

          <div className="workspace-preview" aria-label={t("preview.label")}>
            <div className="workspace-preview__window">
              <div className="workspace-preview__topbar">
                <span className="workspace-preview__traffic">
                  <i />
                  <i />
                  <i />
                </span>
                <span>{t("preview.untitled")}</span>
                <span className="workspace-preview__zoom">100%</span>
              </div>
              <div className="workspace-preview__body">
                <div className="workspace-preview__tools" aria-hidden="true">
                  <span className="is-active">✎</span>
                  <span>⌁</span>
                  <span>◫</span>
                  <span>○</span>
                </div>
                <div className="workspace-preview__canvas">
                  <div className="bead-art" aria-hidden="true">
                    {Array.from({ length: 49 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                </div>
                <div className="workspace-preview__panel">
                  <span className="preview-panel__label">{t("preview.palette")}</span>
                  <strong>MARD 221 v1</strong>
                  <div className="preview-swatches" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="preview-panel__label">{t("preview.canvas")}</span>
                  <strong>29 × 29</strong>
                </div>
              </div>
              <div className="workspace-preview__statusbar">
                <span>{t("preview.coordinates")}: 14, 14</span>
                <span>{t("preview.beads")}: 113</span>
              </div>
            </div>
            <span className="preview-orbit preview-orbit--one" aria-hidden="true" />
            <span className="preview-orbit preview-orbit--two" aria-hidden="true" />
          </div>
        </section>

        <section className="quick-start" aria-labelledby="quick-start-title">
          <div className="section-heading">
            <div>
              <span className="section-heading__eyebrow">{t("home.workflow")}</span>
              <h2 id="quick-start-title">{t("home.quickStart")}</h2>
            </div>
            <span className="section-heading__hint">{t("home.actionHint")}</span>
          </div>

          <div className="action-grid">
            <ActionCard
              accent="violet"
              description={t("actions.new.description")}
              icon={<PlusIcon />}
              title={t("actions.new.title")}
              unavailableLabel={t("status.nextStep")}
            />
            <ActionCard
              accent="mint"
              description={t("actions.image.description")}
              icon={<ImageIcon />}
              title={t("actions.image.title")}
              unavailableLabel={t("status.planned")}
            />
            <ActionCard
              accent="peach"
              description={t("actions.csv.description")}
              icon={<TableIcon />}
              title={t("actions.csv.title")}
              unavailableLabel={t("status.planned")}
            />
          </div>
        </section>

        <section className="recent-projects" aria-labelledby="recent-title">
          <div className="section-heading">
            <div>
              <span className="section-heading__eyebrow">{t("recent.library")}</span>
              <h2 id="recent-title">{t("recent.title")}</h2>
            </div>
          </div>
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">
              <ClockIcon />
            </span>
            <div>
              <strong>{t("recent.emptyTitle")}</strong>
              <p>{t("recent.emptyDescription")}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>{t("footer.privacy")}</span>
        <span>{t("footer.version")}</span>
      </footer>
    </div>
  );
}

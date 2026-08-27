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
  FileIcon,
} from "../../components/Icons";
import { BrandMark } from "../../components/BrandMark";
import {
  isLocale,
  isThemeMode,
  useSettingsStore,
  type Locale,
  type ThemeMode,
} from "../../app/settings-store";
import type { RecentProject } from "../project/project-transport";
import { projectPreviewDataUrl } from "../project/project-preview";

function recentPreviewUrl(project: RecentProject): string | undefined {
  if (!project.preview) return undefined;
  try {
    return projectPreviewDataUrl(project.preview);
  } catch {
    return undefined;
  }
}

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  accent: "violet" | "mint" | "peach";
  disabled?: boolean;
  onClick?: () => void;
}

function ActionCard({ icon, title, accent, disabled = false, onClick }: ActionCardProps) {
  return (
    <button
      className="action-card"
      data-accent={accent}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="action-card__icon">{icon}</span>
      <span className="action-card__content">
        <strong>{title}</strong>
      </span>
      <ArrowIcon className="action-card__arrow" />
    </button>
  );
}

interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: ReactNode;
}

interface StartPageProps {
  readonly onCreateBlank: () => void;
  readonly onImportCsv: () => void;
  readonly onImportImage: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenRecent: (metadataPath: string) => void;
  readonly openingProject: boolean;
  readonly projectError: string;
  readonly recentProjects: readonly RecentProject[];
  readonly recentProjectsLoading: boolean;
}

export function StartPage({
  onCreateBlank,
  onImportCsv,
  onImportImage,
  onOpenProject,
  onOpenRecent,
  openingProject,
  projectError,
  recentProjects,
  recentProjectsLoading,
}: StartPageProps) {
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
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
            <h1 id="hero-title">{t("home.title")}</h1>
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
            <h2 id="quick-start-title">{t("home.quickStart")}</h2>
          </div>

          <div className="action-grid">
            <ActionCard
              accent="violet"
              icon={<PlusIcon />}
              onClick={onCreateBlank}
              title={t("actions.new.title")}
            />
            <ActionCard
              accent="mint"
              icon={<ImageIcon />}
              onClick={onImportImage}
              title={t("actions.image.title")}
            />
            <ActionCard
              accent="peach"
              icon={<TableIcon />}
              onClick={onImportCsv}
              title={t("actions.csv.title")}
            />
          </div>
        </section>

        <section className="recent-projects" aria-labelledby="recent-title">
          <div className="section-heading">
            <h2 id="recent-title">{t("recent.title")}</h2>
            <button
              className="button button--secondary recent-projects__open"
              disabled={openingProject}
              onClick={onOpenProject}
              type="button"
            >
              <FileIcon />
              {openingProject ? t("project.opening") : t("project.open")}
            </button>
          </div>
          {projectError ? (
            <p className="recent-projects__error" role="alert" title={projectError}>
              {t("project.errors.open")}
            </p>
          ) : null}
          {recentProjects.length > 0 ? (
            <div className="recent-project-list">
              {recentProjects.map((project) => {
                const openedAt = new Date(project.lastOpenedAt);
                const previewUrl = recentPreviewUrl(project);
                return (
                  <button
                    className="recent-project-card"
                    disabled={openingProject}
                    key={project.metadataPath}
                    onClick={() => onOpenRecent(project.metadataPath)}
                    type="button"
                  >
                    {previewUrl ? (
                      <span className="recent-project-card__preview">
                        <img
                          alt={t("recent.previewAlt", { name: project.displayName })}
                          src={previewUrl}
                        />
                      </span>
                    ) : (
                      <span className="recent-project-card__icon" aria-hidden="true">
                        <ClockIcon />
                      </span>
                    )}
                    <span className="recent-project-card__content">
                      <strong>{project.displayName}</strong>
                      <span title={project.metadataPath}>{project.metadataPath}</span>
                    </span>
                    <time dateTime={openedAt.toISOString()}>{dateFormatter.format(openedAt)}</time>
                    <ArrowIcon className="recent-project-card__arrow" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-state__icon" aria-hidden="true">
                <ClockIcon />
              </span>
              <div>
                <strong>
                  {recentProjectsLoading ? t("recent.loading") : t("recent.emptyTitle")}
                </strong>
                <p>
                  {recentProjectsLoading
                    ? t("recent.loadingDescription")
                    : t("recent.emptyDescription")}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <span>{t("footer.privacy")}</span>
        <span>{t("footer.version")}</span>
      </footer>
    </div>
  );
}

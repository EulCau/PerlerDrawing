import { useEffect } from "react";
import i18n from "../i18n/config";
import { useSettingsStore } from "./settings-store";
import { resolveTheme } from "./theme";

export function PreferencesSync() {
  const locale = useSettingsStore((state) => state.locale);
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme = resolveTheme(theme, mediaQuery?.matches ?? false);
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (theme !== "system" || !mediaQuery) {
      return undefined;
    }

    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);

  return null;
}

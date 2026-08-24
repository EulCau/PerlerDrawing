import { create } from "zustand";
import { persist } from "zustand/middleware";

export const locales = ["zh-CN", "en-US"] as const;
export const themeModes = ["light", "dark", "system"] as const;

export type Locale = (typeof locales)[number];
export type ThemeMode = (typeof themeModes)[number];

interface SettingsState {
  locale: Locale;
  theme: ThemeMode;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
}

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export function isThemeMode(value: string): value is ThemeMode {
  return themeModes.some((theme) => theme === value);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "zh-CN",
      theme: "system",
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "perlerdrawing.preferences",
      partialize: ({ locale, theme }) => ({ locale, theme }),
    },
  ),
);

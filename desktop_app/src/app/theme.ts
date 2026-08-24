import type { ThemeMode } from "./settings-store";

type ResolvedTheme = "light" | "dark";

export function resolveTheme(theme: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }

  return theme;
}

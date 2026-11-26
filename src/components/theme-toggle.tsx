"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "side" }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className={variant === "side" ? "side-btn" : "icon-btn"}
      aria-label="Toggle colour theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="theme-icons" aria-hidden>
        <Moon className="moon" size={18} />
        <Sun className="sun" size={18} />
      </span>
      {variant === "side" ? "Theme" : null}
    </button>
  );
}

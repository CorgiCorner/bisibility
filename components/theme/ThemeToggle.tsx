"use client";

import { applyTheme, readTheme } from "@/lib/theme/browser-theme";
import IconButton from "@mui/material/IconButton";
import { useColorScheme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import { MoonIcon as Moon, SunIcon as Sun } from "@phosphor-icons/react";

export function ThemeToggle() {
  const { setMode } = useColorScheme();

  function toggleTheme() {
    const next = readTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setMode(next);
  }

  return (
    <Tooltip title="Toggle theme">
      <IconButton
        aria-label="Toggle theme"
        onClick={toggleTheme}
        sx={{
          backgroundColor: "var(--bg-elev)",
          border: "1px solid var(--border-strong)",
          color: "var(--fg-muted)",
          height: 40,
          width: 40,
          "&:hover": {
            borderColor: "var(--accent)",
            color: "var(--accent)",
          },
        }}
      >
        <Sun className="hidden dark:block" size={17} weight="bold" />
        <Moon className="dark:hidden" size={17} weight="bold" />
      </IconButton>
    </Tooltip>
  );
}

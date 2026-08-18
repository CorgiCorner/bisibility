import type { Config } from "tailwindcss";
import { tailwindSemanticColors } from "./lib/theme/tokens";
import { UI_MAX_WIDTH_ROLES, UI_RADIUS_ROLES, UI_TYPE_ROLES } from "./lib/ui/design-role-tokens";

const config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  important: false,
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
    },
    extend: {
      colors: tailwindSemanticColors,
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: UI_TYPE_ROLES,
      borderRadius: UI_RADIUS_ROLES,
      maxWidth: UI_MAX_WIDTH_ROLES,
    },
  },
  plugins: [],
} satisfies Config;

export default config;

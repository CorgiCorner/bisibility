import { createTheme, type PaletteOptions, type Shadows } from "@mui/material/styles";
import { type ColorSchemeName, colorSchemes } from "./tokens";

const flatShadows = Array.from({ length: 25 }, () => "none") as Shadows;

function paletteFor(scheme: ColorSchemeName): PaletteOptions {
  const token = colorSchemes[scheme];

  return {
    mode: scheme,
    primary: {
      main: token.accent,
      dark: token["accent-hover"],
      light: token["accent-soft"],
      contrastText: scheme === "light" ? token["bg-sidebar"] : token["bg-inset"],
    },
    secondary: {
      main: token.purple,
      contrastText: token["bg-sidebar"],
    },
    success: { main: token.green },
    error: { main: token.red },
    warning: { main: token.yellow },
    info: { main: token.blue },
    background: {
      default: token.bg,
      paper: token["bg-elev"],
    },
    text: {
      primary: token.fg,
      secondary: token["fg-muted"],
      disabled: token["fg-faint"],
    },
    divider: token.border,
  };
}

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data-theme",
  },
  colorSchemes: {
    light: { palette: paletteFor("light") },
    dark: { palette: paletteFor("dark") },
  },
  palette: paletteFor("light"),
  shape: {
    borderRadius: 9,
  },
  shadows: flatShadows,
  typography: {
    fontFamily: "var(--font-sans), system-ui, sans-serif",
    h1: { fontSize: "21px", fontWeight: 600, lineHeight: 1.25 },
    h2: { fontSize: "15px", fontWeight: 600, lineHeight: 1.35 },
    body1: { fontSize: "14px", lineHeight: 1.55 },
    body2: { fontSize: "13px", lineHeight: 1.5 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        // No ripple/focus animation on any button - the app uses border/color focus
        // states instead.
        disableRipple: true,
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 9,
          boxShadow: "none",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: "13px",
          fontWeight: 600,
          lineHeight: 1.25,
          minHeight: 36,
          padding: "8px 16px",
          textTransform: "none",
          "&:hover": { boxShadow: "none" },
        },
        sizeLarge: {
          borderRadius: 10,
          fontSize: "14.5px",
          minHeight: 44,
          padding: "11px 18px",
        },
        sizeSmall: {
          fontSize: "12.5px",
          minHeight: 34,
          padding: "6px 12px",
        },
      },
      variants: [
        {
          props: { color: "inherit", variant: "outlined" },
          style: {
            backgroundColor: "var(--bg-elev)",
            borderColor: "var(--border-strong)",
            color: "var(--fg)",
            "&:hover": {
              backgroundColor: "var(--bg-sunken)",
              borderColor: "var(--border-strong)",
            },
          },
        },
      ],
    },
    MuiButtonGroup: {
      variants: [
        {
          props: { color: "primary", variant: "contained" },
          style: {
            "& > .MuiButtonGroup-firstButton, & > .MuiButtonGroup-middleButton": {
              borderColor: "var(--accent-hover)",
            },
            "& > .Mui-disabled.MuiButtonGroup-firstButton, & > .Mui-disabled.MuiButtonGroup-middleButton":
              {
                borderColor: "transparent",
              },
          },
        },
      ],
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          boxShadow: "none",
        },
      },
    },
  },
});

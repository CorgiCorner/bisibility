"use client";

import { Button } from "@/components/ui/Button";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

// A failed root layout may omit every stylesheet, including fonts and theme tokens.
export const emergencyRecoveryStyles = {
  main: {
    boxSizing: "border-box",
    display: "grid",
    minHeight: "100dvh",
    placeItems: "center",
    padding: "24px",
    background: "var(--bg, #f5f5f5)",
    color: "var(--fg, #202020)",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    textAlign: "center",
  },
  content: { width: "100%", maxWidth: "448px" },
  status: {
    margin: 0,
    fontSize: "11px",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    color: "var(--fg-muted, #585858)",
  },
  title: { margin: "12px 0 0", fontSize: "24px", lineHeight: 1.3, fontWeight: 600 },
  description: {
    margin: "12px 0 0",
    fontSize: "14px",
    lineHeight: "24px",
    color: "var(--fg-muted, #585858)",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "8px",
    marginTop: "24px",
  },
  button: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minHeight: "40px",
    padding: "8px 16px",
    borderRadius: "var(--radius-control, 6px)",
    font: "inherit",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
  },
  primary: {
    border: "1px solid transparent",
    background: "var(--accent-solid, #171717)",
    color: "var(--accent-on-solid, #fafafa)",
  },
  secondary: {
    border: "1px solid var(--border-control, #7c7c7c)",
    background: "var(--bg-elev, #ffffff)",
    color: "var(--fg, #202020)",
  },
} satisfies Record<string, CSSProperties>;

type EmergencyRecoveryProps = {
  kind: "error" | "notFound";
  onReset?: () => void;
};

/** This recovery surface must keep working when every regular provider has failed. */
export function EmergencyRecovery({ kind, onReset }: Readonly<EmergencyRecoveryProps>) {
  const t = useTranslations("shared.emergencyRecovery");
  const copy =
    kind === "error"
      ? {
          backToApp: t("error.backToApp"),
          description: t("error.description"),
          status: t("error.status"),
          title: t("error.title"),
        }
      : {
          backToApp: t("notFound.backToApp"),
          description: t("notFound.description"),
          status: t("notFound.status"),
          title: t("notFound.title"),
        };

  return (
    <main style={emergencyRecoveryStyles.main}>
      <div style={emergencyRecoveryStyles.content}>
        <p style={emergencyRecoveryStyles.status}>{copy.status}</p>
        <h1 style={emergencyRecoveryStyles.title}>{copy.title}</h1>
        <p style={emergencyRecoveryStyles.description}>{copy.description}</p>
        <div style={emergencyRecoveryStyles.actions}>
          {kind === "error" ? (
            <Button
              style={{ ...emergencyRecoveryStyles.button, ...emergencyRecoveryStyles.primary }}
              startIcon={<ArrowClockwise aria-hidden size={16} weight="regular" />}
              onClick={onReset}
              type="button"
            >
              {t("error.retry")}
            </Button>
          ) : null}
          <Button
            style={{ ...emergencyRecoveryStyles.button, ...emergencyRecoveryStyles.secondary }}
            variant="secondary"
            href="/app"
          >
            {copy.backToApp}
          </Button>
        </div>
      </div>
    </main>
  );
}

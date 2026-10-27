"use client";

import { useAppRealtime } from "@/lib/realtime/useAppRealtime";
import { WifiHighIcon } from "@phosphor-icons/react/dist/csr/WifiHigh";
import { WifiSlashIcon } from "@phosphor-icons/react/dist/csr/WifiSlash";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function RealtimeIndicator() {
  const { status } = useAppRealtime();
  const t = useTranslations("shell.realtime");
  const phase =
    status === "live" || status === "live-polling"
      ? "live"
      : status === "connecting"
        ? "connecting"
        : "reconnecting";
  const Icon = phase === "live" ? WifiHighIcon : WifiSlashIcon;
  const [observed, setObserved] = useState({
    phase,
    interrupted: phase === "reconnecting",
    announcement: "",
  });
  if (observed.phase !== phase) {
    const announce = phase === "reconnecting" || (phase === "live" && observed.interrupted);
    setObserved({
      phase,
      interrupted: phase === "reconnecting",
      announcement: announce ? t(phase) : observed.announcement,
    });
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted"
      title={t(phase)}
    >
      <Icon
        weight="regular"
        aria-hidden
        size={14}
        className={phase === "live" ? "text-green-text" : "text-fg-muted"}
      />
      <span className="sr-only sm:not-sr-only">{t(phase)}</span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {observed.announcement}
      </span>
    </span>
  );
}

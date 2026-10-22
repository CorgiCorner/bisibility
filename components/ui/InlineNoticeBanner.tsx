"use client";

import { IconButton } from "@/components/ui/IconButton";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/ssr/Info";
import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useState } from "react";
import styles from "./InlineNoticeBanner.module.css";

export function InlineNoticeBanner({
  children,
  link,
  testId,
  fullText,
  regionLabel,
  live = true,
}: Readonly<{
  children: ReactNode;
  link?: { href: string; label: string };
  testId?: string;
  fullText?: string;
  regionLabel?: string;
  live?: boolean;
}>) {
  const t = useTranslations("shared.controls.noticeMotion");
  const [paused, setPaused] = useState(false);
  const motionLabel = paused ? t("resume") : t("pause");
  const label = regionLabel?.trim() || fullText?.trim();
  return (
    <div
      className={`${styles.banner} flex min-w-0 items-center gap-3 border-b border-border bg-bg-elev px-3 py-2 sm:px-4`}
      data-testid={testId}
      data-paused={paused ? "true" : undefined}
      role={live ? "status" : undefined}
      style={
        {
          "--notice-scroll-duration": `${Math.max(14, (fullText?.length ?? 0) / 6)}s`,
        } as CSSProperties
      }
    >
      <Info weight="regular" aria-hidden className="shrink-0 text-fg-muted" size={16} />
      <section
        className={`${styles.viewport} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid`}
        aria-label={label}
        role={label ? "region" : undefined}
        tabIndex={label ? 0 : undefined}
        title={fullText}
      >
        <div className={`bv-marquee-track ${styles.track}`}>
          <p className={styles.copy}>{children}</p>
          <p aria-hidden className={`${styles.copy} ${styles.duplicate}`}>
            {children}
          </p>
        </div>
      </section>
      <IconButton
        size="small"
        className={styles.motionToggle}
        style={{ minHeight: 20, width: 20, padding: 0 }}
        aria-label={motionLabel}
        aria-pressed={paused}
        title={motionLabel}
        onClick={() => setPaused((current) => !current)}
      >
        {paused ? (
          <PlayIcon weight="regular" aria-hidden size={14} />
        ) : (
          <PauseIcon weight="regular" aria-hidden size={14} />
        )}
      </IconButton>
      {link ? (
        <a
          className="max-w-[35%] shrink-0 truncate text-[12px] font-medium text-fg underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
          href={link.href}
          title={link.label}
        >
          {link.label}
        </a>
      ) : null}
    </div>
  );
}

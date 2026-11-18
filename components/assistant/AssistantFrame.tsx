"use client";

import { Button } from "@/components/ui/Button";
import { DialogSurface } from "@/components/ui/DialogSurface";
import { ASSISTANT_PANEL_INSET_PX, ASSISTANT_PANEL_WIDTH_PX } from "@/lib/assistant/dock";
import { cn } from "@/lib/ui/cn";
import {
  FLOATING_DRAWER_DESKTOP_QUERY,
  FLOATING_DRAWER_FRAME_CLASS,
  FLOATING_DRAWER_PANEL_CLASS,
  FLOATING_DRAWER_SHEET_CLASS,
  floatingDrawerDuration,
} from "@/lib/ui/floating-drawer";
import { FloatingDrawerGrab } from "@/lib/ui/floating-drawer-grab";
import { useFloatingDrawerSwipe } from "@/lib/ui/use-floating-drawer-swipe";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { type ComponentProps, type CSSProperties, type ReactNode, useId } from "react";
import styles from "./AssistantFrame.module.css";

type AssistantFrameProps = {
  /** Header actions between the title and the close button (History, New chat). */
  actions: ReactNode;
  children: ReactNode;
  close: () => void;
  open: boolean;
  subtitle: string | undefined;
};

/**
 * The shared floating drawer chrome. From `sm` up a non-modal panel inset 12px from the edge, so
 * the page stays usable beside it (the content column reserves room only when it keeps 960px,
 * see `lib/assistant/dock.ts`). Below `sm` a bottom sheet with the grab handle.
 */
export function AssistantFrame({
  actions,
  children,
  close,
  open,
  subtitle,
}: Readonly<AssistantFrameProps>) {
  const t = useTranslations("assistant");
  const titleId = useId();
  const desktop = useMediaQuery(FLOATING_DRAWER_DESKTOP_QUERY);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const swipe = useFloatingDrawerSwipe({ enabled: !desktop, onClose: close, reducedMotion });
  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      {desktop ? null : <FloatingDrawerGrab {...swipe} />}
      <header
        className={cn(
          "flex items-center gap-1.5 border-b border-border px-3.5 py-3",
          !desktop && "touch-none px-4 pt-2",
        )}
        {...(desktop ? undefined : swipe)}
      >
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-sm font-semibold" id={titleId}>
            {t("title")}
          </h2>
          {subtitle ? (
            <p className="m-0 truncate text-xs text-fg-muted" title={subtitle}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions}
        <Button
          aria-label={t("close")}
          className="min-w-0 shrink-0"
          onClick={close}
          size="input"
          variant="ghost"
        >
          <XIcon aria-hidden size={16} weight="regular" />
        </Button>
      </header>
      {children}
    </div>
  );
  const sheetProps: ComponentProps<"div"> & { "data-placement": "sheet" } = {
    "aria-labelledby": titleId,
    "aria-modal": true,
    // 48px from the top, like the mobile design, so the page stays visible behind the sheet.
    className: cn(FLOATING_DRAWER_FRAME_CLASS, FLOATING_DRAWER_SHEET_CLASS, "top-12"),
    "data-placement": "sheet",
    role: "dialog",
    style: { width: "auto" },
  };
  const duration = floatingDrawerDuration("panel", reducedMotion);
  if (desktop)
    return (
      <div className={styles.viewport}>
        <aside
          aria-labelledby={titleId}
          className={cn(
            "fixed",
            styles.panel,
            FLOATING_DRAWER_FRAME_CLASS,
            FLOATING_DRAWER_PANEL_CLASS,
          )}
          data-open={open ? "true" : "false"}
          aria-hidden={!open}
          inert={!open}
          data-placement="panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
          style={
            {
              "--assistant-enter-duration": `${duration.enter}ms`,
              "--assistant-exit-duration": `${duration.exit}ms`,
              width: ASSISTANT_PANEL_WIDTH_PX,
              maxWidth: `calc(100vw - ${2 * ASSISTANT_PANEL_INSET_PX}px)`,
            } as CSSProperties
          }
        >
          {body}
        </aside>
      </div>
    );
  return (
    <DialogSurface
      contentProps={sheetProps}
      duration={floatingDrawerDuration("sheet", reducedMotion)}
      onClose={() => close()}
      open={open}
      side="bottom"
    >
      {body}
    </DialogSurface>
  );
}

"use client";
import { cn } from "@/lib/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/lib/ui/primitives/dialog";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import type { ComponentProps, ReactNode } from "react";
import styles from "./dialog-surface.module.css";
import { useOverlayComposition } from "./use-overlay-composition";
import { useOverlayEntry } from "./use-overlay-entry";
import { useOverlayFocus } from "./use-overlay-focus";

export type DialogCloseReason = "backdropClick" | "escapeKeyDown";
export type DialogSurfaceProps = {
  open: boolean;
  onClose: (event: Event, reason: DialogCloseReason) => void;
  children: ReactNode;
  side?: "left" | "right" | "bottom";
  contentProps?: ComponentProps<"div">;
  backdropProps?: ComponentProps<"div">;
  duration?: { enter: number; exit: number };
  onEntered?: () => void;
  onExited?: () => void;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};
export function DialogSurface({
  open,
  onClose,
  children,
  side,
  contentProps = {},
  backdropProps = {},
  duration,
  onEntered,
  onExited,
  ...props
}: DialogSurfaceProps) {
  const returnFocus = useOverlayFocus(open);
  const compositionRef = useOverlayComposition(open);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  useOverlayEntry(open, reduced ? 0 : (duration?.enter ?? 240), onEntered);
  return (
    <Dialog open={open}>
      <DialogPortal>
        <DialogOverlay
          {...backdropProps}
          data-slot="dialog-overlay"
          className={cn(styles.backdrop, backdropProps.className)}
        />
        <DialogContent
          {...contentProps}
          ref={compositionRef}
          {...props}
          data-ui-overlay
          aria-modal="true"
          data-side={side ?? "center"}
          aria-describedby={props["aria-describedby"]}
          className={cn(styles.panel, contentProps.className)}
          style={{
            "--enter-duration": `${duration?.enter ?? 240}ms`,
            "--exit-duration": `${duration?.exit ?? 200}ms`,
            ...contentProps.style,
          }}
          onEscapeKeyDown={(event) => {
            if (event.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            event.stopPropagation();
            onClose(event, "escapeKeyDown");
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
            onClose(event.detail.originalEvent, "backdropClick");
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
            onExited?.();
          }}
        >
          <DialogTitle asChild>
            <span className="sr-only">Dialog</span>
          </DialogTitle>
          {children}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

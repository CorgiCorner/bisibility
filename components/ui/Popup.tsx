"use client";
import { cn } from "@/lib/ui/cn";
import { type ComponentProps, type ReactNode, useRef } from "react";
import styles from "./overlay.module.css";
import { usePopupAnchor } from "./popup-anchor";
import { Popover, PopoverAnchor, PopoverContent, PopoverPortal } from "./primitives/popover";

export type PopupProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  contentProps?: ComponentProps<"div">;
  autoFocus?: boolean;
  restoreFocus?: boolean | "escape";
  id?: string;
  "aria-label"?: string;
  instant?: boolean;
};
export function Popup({
  anchorEl,
  open,
  onClose,
  children,
  align = "start",
  side = "bottom",
  contentProps = {},
  autoFocus = true,
  restoreFocus = true,
  instant,
  ...props
}: PopupProps) {
  const { virtualRef, element } = usePopupAnchor(anchorEl);
  const escaped = useRef(false);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      modal
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverPortal>
        <PopoverContent
          {...props}
          data-ui-overlay
          {...contentProps}
          align={align}
          side={side}
          collisionPadding={16}
          className={cn(styles.popup, contentProps.className)}
          data-instant={instant || undefined}
          onEscapeKeyDown={(event) => {
            escaped.current = true;
            event.stopPropagation();
          }}
          onOpenAutoFocus={(event) => {
            if (!autoFocus) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocus === true || (restoreFocus === "escape" && escaped.current)) {
              element.current?.focus();
            }
            escaped.current = false;
          }}
        >
          {children}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

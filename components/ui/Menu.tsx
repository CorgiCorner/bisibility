"use client";
import { cn } from "@/lib/ui/cn";
import type { ComponentProps, ReactNode } from "react";
import styles from "./overlay.module.css";
import { usePopupAnchor } from "./popup-anchor";
import { MenuAnchor, MenuContent, MenuPortal, Menu as Root } from "./primitives/menu";

export type MenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  contentProps?: ComponentProps<"div">;
  listProps?: ComponentProps<"div">;
  onExited?: () => void;
  autoFocus?: boolean;
  instant?: boolean;
  id?: string;
  onClick?: ComponentProps<"div">["onClick"];
  restoreFocus?: boolean;
};
export function Menu({
  anchorEl,
  open,
  onClose,
  children,
  align = "start",
  side = "bottom",
  contentProps = {},
  listProps = {},
  onExited,
  autoFocus = true,
  instant,
  restoreFocus = true,
  ...props
}: MenuProps) {
  const { virtualRef, element } = usePopupAnchor(anchorEl);
  return (
    <Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <MenuAnchor virtualRef={virtualRef} />
      <MenuPortal>
        <MenuContent
          {...props}
          data-ui-overlay
          data-instant={instant || undefined}
          {...listProps}
          {...contentProps}
          align={align}
          side={side}
          collisionPadding={16}
          loop
          style={contentProps.style}
          className={cn(styles.popup, styles.menu, contentProps.className)}
          onKeyDown={(event) => {
            listProps.onKeyDown?.(event);
            contentProps.onKeyDown?.(event);
            if (event.key === "Tab") onClose();
          }}
          onEntryFocus={(event) => {
            if (!autoFocus) {
              event.preventDefault();
              if (event.target instanceof HTMLElement) {
                event.target
                  .querySelector<HTMLElement>("[data-menu-search]")
                  ?.focus({ preventScroll: true });
              }
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocus) element.current?.focus();
            onExited?.();
          }}
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className={listProps.className} style={listProps.style}>
            {children}
          </div>
        </MenuContent>
      </MenuPortal>
    </Root>
  );
}

"use client";
import * as Popper from "@radix-ui/react-popper";
import type { ComponentProps } from "react";
import { Portal } from "./Portal";
import { usePopupAnchor } from "./popup-anchor";
export function AnchoredList({
  anchorEl,
  open,
  ...props
}: ComponentProps<"div"> & { anchorEl: HTMLElement | null; open: boolean }) {
  const { virtualRef } = usePopupAnchor(anchorEl);
  return (
    <Popper.Root>
      <Popper.Anchor virtualRef={virtualRef} />
      {open ? (
        <Portal>
          <Popper.Content asChild side="bottom" align="start" sideOffset={4} collisionPadding={8}>
            <div
              {...props}
              // React portal events retain the owning dialog's layer and focus handling.
              style={{
                pointerEvents: "auto",
                zIndex: 1301,
                width: "var(--radix-popper-anchor-width)",
                ...props.style,
              }}
            />
          </Popper.Content>
        </Portal>
      ) : null}
    </Popper.Root>
  );
}

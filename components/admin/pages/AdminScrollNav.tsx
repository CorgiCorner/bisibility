"use client";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { type ReactNode, useCallback, useState } from "react";

/** Synchronize scroll affordances with the native scroller and its resized content. */
export function AdminScrollNav({
  activeKey,
  label,
  children,
}: {
  activeKey: string;
  label: string;
  children: ReactNode;
}) {
  const [edges, setEdges] = useState({ left: false, right: false });
  const attach = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !activeKey) return;
      const scroller = node;
      const active = node.querySelector<HTMLElement>('[aria-current="page"]');
      function measure() {
        setEdges((previous) => {
          const next = {
            left: scroller.scrollLeft > 1,
            right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
          };
          return previous.left === next.left && previous.right === next.right ? previous : next;
        });
      }
      function reveal() {
        if (active) {
          const box = active.getBoundingClientRect();
          const viewport = scroller.getBoundingClientRect();
          // Leave room for the edge hints without scrolling the document vertically.
          if (box.left < viewport.left + 20) scroller.scrollLeft -= viewport.left + 20 - box.left;
          else if (box.right > viewport.right - 20)
            scroller.scrollLeft += box.right - viewport.right + 20;
        }
        measure();
      }
      reveal();
      const observer = new ResizeObserver(reveal);
      observer.observe(node);
      for (const child of node.children) observer.observe(child);
      node.addEventListener("scroll", measure, { passive: true });
      return () => {
        observer.disconnect();
        node.removeEventListener("scroll", measure);
      };
    },
    [activeKey],
  );
  return (
    <div className="relative min-w-0 border-b border-border">
      <nav
        ref={attach}
        aria-label={label}
        className="flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap text-[13px]"
      >
        {children}
      </nav>
      {edges.left && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 flex w-5 items-center bg-gradient-to-r from-bg to-transparent text-fg-muted"
        >
          <CaretLeftIcon size={14} weight="regular" />
        </span>
      )}
      {edges.right && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-5 items-center justify-end bg-gradient-to-l from-bg to-transparent text-fg-muted"
        >
          <CaretRightIcon size={14} weight="regular" />
        </span>
      )}
    </div>
  );
}

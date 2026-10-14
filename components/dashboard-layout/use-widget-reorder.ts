"use client";

import { dashboardDropIndex } from "@/lib/dashboard-layout/reorder";
import type { WidgetId } from "@/lib/dashboard-layout/types";
import { type PointerEvent, useCallback, useRef, useState } from "react";

type Drag = {
  id: WidgetId;
  from: number;
  over: number;
  active: boolean;
  pointerId: number;
  startY: number;
  clientY: number;
  centres: number[];
  orderKey: string;
  handle: HTMLButtonElement;
  abort: () => void;
};

export function useWidgetReorder({
  order,
  disabled,
  onDrop,
}: {
  order: readonly WidgetId[];
  disabled: boolean;
  onDrop: (id: WidgetId, target: number) => void;
}) {
  const [preview, setPreview] = useState<Pick<Drag, "id" | "from" | "over"> | null>(null);
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef({ orderKey: order.join(), disabled, onDrop });
  latest.current = { orderKey: order.join(), disabled, onDrop };

  const cancel = useCallback((render = true) => {
    const current = drag.current;
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (current) {
      window.removeEventListener("blur", current.abort);
      window.removeEventListener("resize", current.abort);
    }
    if (current?.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
    if (render) setPreview(null);
  }, []);

  const attachScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current = node;
      if (!node) cancel(false);
    },
    [cancel],
  );

  function updateTarget(current: Drag) {
    const region = scroller.current;
    if (!region) return;
    const y = current.clientY - region.getBoundingClientRect().top + region.scrollTop;
    const over = dashboardDropIndex(current.centres, current.from, y);
    if (!current.active) return;
    current.over = over;
    setPreview((previous) =>
      previous?.id === current.id && previous.over === over
        ? previous
        : { id: current.id, from: current.from, over },
    );
  }
  function scrollAtEdge() {
    frame.current = null;
    const current = drag.current;
    const region = scroller.current;
    if (!current?.active || !region) return;
    if (latest.current.disabled || latest.current.orderKey !== current.orderKey) {
      cancel();
      return;
    }
    const bounds = region.getBoundingClientRect();
    const delta =
      current.clientY < bounds.top + 40 ? -10 : current.clientY > bounds.bottom - 40 ? 10 : 0;
    const before = region.scrollTop;
    region.scrollTop += delta;
    updateTarget(current);
    if (delta && before !== region.scrollTop) frame.current = requestAnimationFrame(scrollAtEdge);
  }

  function handleProps(id: WidgetId, index: number) {
    return {
      style: { touchAction: "none" as const },
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (
          disabled ||
          drag.current ||
          event.isPrimary === false ||
          event.button !== 0 ||
          !list.current ||
          !scroller.current
        )
          return;
        const region = scroller.current;
        const top = region.getBoundingClientRect().top - region.scrollTop;
        const centres = [...list.current.children].map((row) => {
          const bounds = row.getBoundingClientRect();
          return bounds.top - top + bounds.height / 2;
        });
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id,
          from: index,
          over: index,
          active: false,
          pointerId: event.pointerId,
          startY: event.clientY,
          clientY: event.clientY,
          centres,
          orderKey: order.join(),
          handle: event.currentTarget,
          abort: () => cancel(),
        };
        // Gesture listeners are cleared on drop, cancellation, and ref detachment.
        window.addEventListener("blur", drag.current.abort);
        window.addEventListener("resize", drag.current.abort);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.clientY = event.clientY;
        current.active ||= Math.abs(event.clientY - current.startY) > 4;
        updateTarget(current);
        if (current.active && frame.current === null)
          frame.current = requestAnimationFrame(scrollAtEdge);
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.clientY = event.clientY;
        updateTarget(current);
        const valid =
          current.active &&
          !latest.current.disabled &&
          current.orderKey === latest.current.orderKey;
        cancel();
        if (valid && current.over !== current.from) latest.current.onDrop(current.id, current.over);
      },
      onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointerId === event.pointerId) cancel();
      },
      onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointerId === event.pointerId) cancel();
      },
    };
  }
  return {
    preview,
    list,
    attachScroller,
    handleProps,
    cancel,
    isDragging: () => drag.current !== null,
  };
}

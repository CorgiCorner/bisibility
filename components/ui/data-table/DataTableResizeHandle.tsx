"use client";

import type { Header } from "@tanstack/react-table";
import { type MouseEvent, type TouchEvent, useCallback, useRef } from "react";
import { DATA_TABLE_KEYBOARD_RESIZE_STEP, normalizeDataTableSize } from "./data-table-sizing";
import type { DataTableRowBase } from "./data-table-types";

type DataTableResizeHandleProps<TRow extends DataTableRowBase> = {
  header: Header<TRow, unknown>;
  label: string;
  userSize?: number;
};

export function DataTableResizeHandle<TRow extends DataTableRowBase>({
  header,
  label,
  userSize,
}: Readonly<DataTableResizeHandleProps<TRow>>) {
  const focusSize = useRef<{ size: number; userSize?: number } | null>(null);
  const stopListening = useRef<() => void>(() => {});
  const { column } = header;
  const handleRef = useCallback((_node: HTMLHRElement | null) => {
    if (!_node) return;
    return () => stopListening.current();
  }, []);

  function resizeTo(size: number) {
    const next = normalizeDataTableSize(size, column.columnDef.minSize, column.columnDef.maxSize);
    header.getContext().table.setColumnSizing((current) => ({ ...current, [column.id]: next }));
  }

  function beginResize(clientX: number, ownerDocument: Document, touch: boolean) {
    stopListening.current();
    const table = header.getContext().table;
    const startSize = column.getSize();
    const direction = table.options.columnResizeDirection === "rtl" ? -1 : 1;
    const update = (nextClientX: number) => {
      const deltaOffset = (nextClientX - clientX) * direction;
      table.setColumnSizingInfo((current) => ({
        ...current,
        deltaOffset,
        deltaPercentage: deltaOffset / startSize,
      }));
      resizeTo(startSize + deltaOffset);
    };
    const finish = (nextClientX: number) => {
      update(nextClientX);
      table.setColumnSizingInfo((current) => ({
        ...current,
        columnSizingStart: [],
        deltaOffset: null,
        deltaPercentage: null,
        isResizingColumn: false,
        startOffset: null,
        startSize: null,
      }));
      stopListening.current();
    };
    const mouseMove = (event: globalThis.MouseEvent) => update(event.clientX);
    const mouseUp = (event: globalThis.MouseEvent) => finish(event.clientX);
    const touchMove = (event: globalThis.TouchEvent) => {
      const nextTouch = event.touches[0];
      if (!nextTouch) return;
      if (event.cancelable) event.preventDefault();
      update(nextTouch.clientX);
    };
    const touchEnd = (event: globalThis.TouchEvent) =>
      finish(event.changedTouches[0]?.clientX ?? clientX);
    stopListening.current = () => {
      ownerDocument.removeEventListener("mousemove", mouseMove);
      ownerDocument.removeEventListener("mouseup", mouseUp);
      ownerDocument.removeEventListener("touchmove", touchMove);
      ownerDocument.removeEventListener("touchend", touchEnd);
      stopListening.current = () => {};
    };

    table.setColumnSizingInfo((current) => ({
      ...current,
      columnSizingStart: [[column.id, startSize]],
      deltaOffset: 0,
      deltaPercentage: 0,
      isResizingColumn: column.id,
      startOffset: clientX,
      startSize,
    }));
    if (touch) {
      ownerDocument.addEventListener("touchmove", touchMove, { passive: false });
      ownerDocument.addEventListener("touchend", touchEnd, { passive: false });
    } else {
      ownerDocument.addEventListener("mousemove", mouseMove);
      ownerDocument.addEventListener("mouseup", mouseUp);
    }
  }

  return (
    <hr
      aria-label={`Resize ${label} column`}
      aria-orientation="vertical"
      aria-valuemax={column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER}
      aria-valuemin={column.columnDef.minSize ?? 64}
      aria-valuenow={column.getSize()}
      className="absolute inset-y-0 right-0 z-20 m-0 w-3 cursor-col-resize touch-none border-0 outline-none after:absolute after:inset-y-2 after:right-1 after:w-px after:bg-border-control hover:after:bg-accent focus-visible:after:w-0.5 focus-visible:after:bg-accent data-[resizing=true]:after:bg-accent"
      data-resizing={column.getIsResizing() || undefined}
      onBlur={() => {
        focusSize.current = null;
      }}
      onDoubleClick={() => column.resetSize()}
      onFocus={() => {
        focusSize.current = { size: column.getSize(), userSize };
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          resizeTo(
            column.getSize() +
              (event.key === "ArrowRight"
                ? DATA_TABLE_KEYBOARD_RESIZE_STEP
                : -DATA_TABLE_KEYBOARD_RESIZE_STEP),
          );
        } else if (event.key === "Escape" && focusSize.current) {
          event.preventDefault();
          if (focusSize.current.userSize === undefined) column.resetSize();
          else resizeTo(focusSize.current.userSize);
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onMouseDown={(event: MouseEvent<HTMLHRElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        beginResize(event.clientX, event.currentTarget.ownerDocument, false);
      }}
      onTouchStart={(event: TouchEvent<HTMLHRElement>) => {
        const touch = event.touches[0];
        if (!touch || event.touches.length > 1) return;
        beginResize(touch.clientX, event.currentTarget.ownerDocument, true);
      }}
      ref={handleRef}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
    />
  );
}

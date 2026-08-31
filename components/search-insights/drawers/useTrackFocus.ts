"use client";

import { type RefObject, useRef } from "react";

type TrackFocusOpener = {
  /** The control that opened the dialog, which a confirmed add replaces with a plain label. */
  node: HTMLElement | null;
  /** The row that held it, which survives that swap. */
  row: HTMLElement | null;
};

function connected(node: Element | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.isConnected;
}

/**
 * The dialog outlives the control that opened it: a confirmed add turns the row's Track button
 * and the drawer's footer button into labels, so the browser would drop the caret on the body.
 * The chain the design walks is the opener, then the panel it was opened from, then the row it
 * sat in, and it runs after the confirmed state is painted rather than before.
 */
export function useTrackFocus(body: RefObject<HTMLElement | null>) {
  const opener = useRef<TrackFocusOpener>({ node: null, row: null });

  function place() {
    const { node, row } = opener.current;
    if (connected(node)) {
      node.focus();
      return;
    }
    const panel = body.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    const inPanel = panel?.querySelector<HTMLElement>("button") ?? body.current;
    if (connected(inPanel)) {
      inPanel.focus();
      return;
    }
    if (connected(row)) row.focus();
  }

  return {
    capture() {
      const active = document.activeElement;
      const node = active instanceof HTMLElement ? active : null;
      opener.current = { node, row: node?.closest<HTMLElement>("tr[tabindex]") ?? null };
    },
    restore() {
      // Deferred by one task: the label the add produces is committed by React after the handler
      // that awaited the write returns, and the caret has to land on the DOM that results.
      setTimeout(place, 0);
    },
  };
}

"use client";

import { useEffect, useState } from "react";

export function useFilterChipEdges() {
  const [chipsRow, setChipsRow] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Synchronize chip overflow with DOM scroll, resize and content subscriptions.
  useEffect(() => {
    const row = chipsRow;
    if (!row) return;
    const update = () => {
      const start = row.scrollLeft > 1;
      const end = row.scrollWidth - row.clientWidth - row.scrollLeft > 1;
      setEdges((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      );
    };
    const resize = new ResizeObserver(update);
    const observe = () => {
      resize.disconnect();
      resize.observe(row);
      for (const child of row.children) resize.observe(child);
      update();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(row, { childList: true, subtree: true, characterData: true });
    row.addEventListener("scroll", update, { passive: true });
    observe();
    return () => {
      row.removeEventListener("scroll", update);
      mutation.disconnect();
      resize.disconnect();
    };
  }, [chipsRow]);

  return { edges, setChipsRow };
}

"use client";

import { Button } from "@/components/ui/Button";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useTransition } from "react";

const POLL_MS = 45_000;

function documentIsHidden() {
  return document.hidden || document.visibilityState !== "visible";
}

export function SearchInsightsRefresh({ active }: Readonly<{ active: boolean }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (pending) return;
    startTransition(() => {
      router.refresh();
    });
  }, [pending, router]);
  const hostRef = useCallback(
    (node: HTMLSpanElement | null) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!node || !active) return;
      const schedule = () => {
        if (timer.current) clearTimeout(timer.current);
        if (documentIsHidden()) return;
        timer.current = setTimeout(() => {
          timer.current = null;
          if (documentIsHidden()) return;
          refresh();
          schedule();
        }, POLL_MS);
      };
      const visible = () => {
        if (!documentIsHidden()) {
          refresh();
          schedule();
        } else if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      };
      document.addEventListener("visibilitychange", visible);
      schedule();
      return () => {
        document.removeEventListener("visibilitychange", visible);
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
      };
    },
    [active, refresh],
  );
  return (
    <span data-auto-refresh={active ? "active" : "inactive"} ref={hostRef}>
      <Button
        aria-label="Refresh import status"
        loading={pending}
        loadingIndicator={
          <ArrowClockwise weight="regular" aria-hidden className="animate-spin" size={14} />
        }
        onClick={refresh}
        size="xs"
        startIcon={<ArrowClockwise weight="regular" aria-hidden size={14} />}
        variant="ghost"
      >
        Refresh
      </Button>
    </span>
  );
}

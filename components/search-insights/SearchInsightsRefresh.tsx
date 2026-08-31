"use client";

import { Button } from "@/components/ui";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useTransition } from "react";

const POLL_MS = 45_000;

export function SearchInsightsRefresh({ active }: Readonly<{ active: boolean }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshing = useRef(false);
  const refresh = useCallback(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    startTransition(() => {
      router.refresh();
      refreshing.current = false;
    });
  }, [router]);
  const hostRef = useCallback(
    (node: HTMLSpanElement | null) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!node || !active) return;
      const schedule = () => {
        if (timer.current) clearTimeout(timer.current);
        if (document.visibilityState !== "visible") return;
        timer.current = setTimeout(() => {
          refresh();
          schedule();
        }, POLL_MS);
      };
      const visible = () => {
        if (document.visibilityState === "visible") {
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

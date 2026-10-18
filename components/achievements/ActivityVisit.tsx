"use client";
import { calendarDay } from "@/lib/achievements/calendar";
import { touchAchievementVisit } from "@/lib/actions/achievements";
import { useCallback, useRef } from "react";
// Synchronize page visibility with server-owned daily facts; local time only suppresses duplicate calls.
export function ActivityVisit({ timeZone }: { timeZone: string }) {
  const lastAttempt = useRef("");
  const attach = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const visit = () => {
        if (document.visibilityState !== "visible") return;
        const day = calendarDay(new Date(), timeZone);
        if (lastAttempt.current === day) return;
        lastAttempt.current = day;
        void touchAchievementVisit()
          .then((result) => {
            if (result.retry) lastAttempt.current = "";
          })
          .catch(() => {
            lastAttempt.current = "";
          });
      };
      visit();
      document.addEventListener("visibilitychange", visit);
      const timer = window.setInterval(visit, 60000);
      return () => {
        document.removeEventListener("visibilitychange", visit);
        window.clearInterval(timer);
      };
    },
    [timeZone],
  );
  return <span aria-hidden hidden ref={attach} />;
}

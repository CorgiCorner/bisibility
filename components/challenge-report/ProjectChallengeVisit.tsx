"use client";

import { calendarDay } from "@/lib/achievements/calendar";
import { touchProjectChallengeVisitAction } from "@/lib/actions/project-challenge";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * Checks in the current day of a project SEO challenge when a member enters
 * the project, also when they were already signed in. It is mounted only for
 * an open enrollment and keys its once-a-day calls to the enrollment time
 * zone, so a challenge day never rolls over unseen. The server stays the
 * authority: it recomputes the day and writes at most one row per day.
 */
export function ProjectChallengeVisit({
  projectRef,
  timeZone,
}: Readonly<{ projectRef: string; timeZone: string }>) {
  const router = useRouter();
  const lastAttempt = useRef("");
  const attach = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const visit = () => {
        if (document.visibilityState !== "visible") return;
        const day = calendarDay(new Date(), timeZone);
        if (lastAttempt.current === day) return;
        lastAttempt.current = day;
        void touchProjectChallengeVisitAction(projectRef)
          .then((result) => {
            if (result.recorded) router.refresh();
          })
          .catch(() => {
            lastAttempt.current = "";
          });
      };
      visit();
      document.addEventListener("visibilitychange", visit);
      const timer = window.setInterval(visit, 60_000);
      return () => {
        document.removeEventListener("visibilitychange", visit);
        window.clearInterval(timer);
      };
    },
    [projectRef, router, timeZone],
  );
  return <span aria-hidden hidden ref={attach} />;
}

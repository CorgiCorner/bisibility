"use client";

import { IconButton } from "@/components/ui/IconButton";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { FirstCheckIllustration } from "./FirstCheckIllustration";
import { FloatingIntroStack } from "./FloatingIntroStack";

const changeEvent = "bisibility:first-check-intro-dismissed";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changeEvent, listener);
  };
}

export function FirstCheckIntro({
  action,
  projectId,
}: Readonly<{ action: ReactNode; projectId: string }>) {
  const t = useTranslations("projectDashboard.noData.firstCheckIntro");
  const storageKey = `bisibility:first-check-intro:v1:dismissed:${projectId}`;
  const [dismissedNow, setDismissedNow] = useState(false);
  const readDismissed = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }, [storageKey]);
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);

  function dismiss() {
    setDismissedNow(true);
    try {
      window.localStorage.setItem(storageKey, "1");
      window.dispatchEvent(new Event(changeEvent));
    } catch {
      // Dismiss for this visit when browser storage is unavailable.
    }
  }

  if (dismissed || dismissedNow) return null;
  return (
    <FloatingIntroStack
      cards={[
        {
          id: projectId,
          content: (
            <section
              aria-label={t("title")}
              className="relative grid w-full overflow-hidden rounded-card border border-border bg-bg-elev shadow-lg"
            >
              <div className="flex h-[132px] items-center justify-center bg-bg-sunken/60 px-12">
                <FirstCheckIllustration />
              </div>
              <div className="flex min-w-0 flex-col items-center justify-center gap-3 px-5 py-5 text-center">
                <h3 className="font-display text-xl leading-tight text-fg">{t("title")}</h3>
                <p className="text-[13px] leading-relaxed text-fg-muted">{t("description")}</p>
                {action}
              </div>
              <IconButton
                aria-label={t("dismiss")}
                title={t("dismiss")}
                className="absolute right-1 top-1 text-fg-muted"
                onClick={dismiss}
                size="small"
                type="button"
              >
                <XIcon weight="regular" aria-hidden size={15} />
              </IconButton>
            </section>
          ),
        },
      ]}
    />
  );
}

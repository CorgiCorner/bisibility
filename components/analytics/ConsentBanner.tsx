"use client";

import {
  ConsentSettingsModal,
  type SaveConsent,
} from "@/components/analytics/ConsentSettingsModal";
import { localizedConsentCopy } from "@/components/analytics/consent-copy";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Portal } from "@/components/ui/Portal";
import { saveAnalyticsConsent } from "@/lib/actions/analytics-consent";
import {
  applyAnalyticsConsent,
  readAnalyticsConsentScope,
  setAnalyticsReplay,
} from "@/lib/analytics/client";
import {
  type ConsentPromptContext,
  type ConsentState,
  pendingConsent,
} from "@/lib/analytics/consent";
import { readBrowserConsent, restrictConsentImmediately } from "@/lib/analytics/consent-client";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import styles from "./ConsentBanner.module.css";
import { type ConsentBannerDelay, createConsentBannerState } from "./consent-banner-state";

type ConsentBannerProps = {
  initialConsent?: ConsentState;
  saveConsent?: SaveConsent;
  delayMs?: ConsentBannerDelay;
};

export function ConsentBanner({
  saveConsent = saveAnalyticsConsent,
  initialConsent = pendingConsent(),
  delayMs = 5000,
}: Readonly<ConsentBannerProps>) {
  const t = useTranslations("shared.analyticsConsent");
  const consentCopy = localizedConsentCopy(t);
  const delay =
    initialConsent.replayNeedsDecision || initialConsent.analyticsNeedsDecision ? 0 : delayMs;
  const [display] = useState(() => createConsentBannerState(initialConsent, delay));
  const presentation = useSyncExternalStore(
    display.subscribe,
    display.getSnapshot,
    display.getServerSnapshot,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsConsent, setSettingsConsent] = useState(initialConsent);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const variant = initialConsent.replayNeedsDecision
    ? "replay_update"
    : delay === 0
      ? "immediate"
      : "delayed_5s";

  function context(source: ConsentPromptContext["source"]): ConsentPromptContext {
    return {
      variant,
      source,
      decision_ms: Math.min(
        86_400_000,
        Math.max(0, Date.now() - (presentation.shownAt ?? Date.now())),
      ),
    };
  }

  async function choose(analytics: boolean) {
    const scope = readAnalyticsConsentScope();
    restrictConsentImmediately({ analytics, replay: analytics });
    setSaving(true);
    setActionError(null);
    try {
      const consent = await saveConsent({ analytics, replay: analytics }, context("banner"));
      if (scope === readAnalyticsConsentScope()) {
        applyAnalyticsConsent(consent);
        setAnalyticsReplay(consent.replay);
      }
      display.close();
    } catch {
      setActionError(t("banner.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (presentation.phase === "waiting" || presentation.phase === "closed") return null;
  const inactive = saving || presentation.phase === "closing";

  return (
    <>
      <Portal>
        <Card
          aria-label={t("banner.ariaLabel")}
          role="region"
          aria-hidden={presentation.phase === "closing" || undefined}
          inert={presentation.phase === "closing" || undefined}
          data-state={presentation.phase}
          data-consent-variant={variant}
          style={{ zIndex: 1299 }}
          className={`${styles.banner} fixed bottom-3 left-3 w-[calc(100%-1.5rem)] max-w-[430px] p-3 sm:bottom-4 sm:left-4`}
        >
          <p className="m-0 text-[12px] leading-4 text-fg-muted">
            {initialConsent.replayNeedsDecision
              ? consentCopy.banner.update
              : consentCopy.banner.body}
          </p>
          <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-stretch gap-1">
            <Button
              className="h-auto min-h-9 w-full whitespace-normal px-2 py-1 leading-4"
              disabled={inactive}
              onClick={() => void choose(true)}
              size="sm"
            >
              {t("actions.acceptAll")}
            </Button>
            <Button
              className="h-auto min-h-9 w-full whitespace-normal px-2 py-1 leading-4"
              disabled={inactive}
              onClick={() => void choose(false)}
              size="sm"
              variant="secondary"
            >
              {t("actions.rejectAll")}
            </Button>
            <Button
              className="h-auto min-h-9 px-2 py-1"
              disabled={inactive}
              onClick={() => {
                setSettingsConsent(readBrowserConsent(initialConsent));
                setSettingsOpen(true);
              }}
              size="sm"
              variant="ghost"
            >
              {t("actions.settings")}
            </Button>
          </div>
          {actionError ? (
            <p className="m-0 mt-2 text-[12px] text-red-text" role="alert">
              {actionError}
            </p>
          ) : null}
        </Card>
      </Portal>
      {settingsOpen ? (
        <ConsentSettingsModal
          initialConsent={settingsConsent}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => display.close()}
          open
          saveConsent={(values) => saveConsent(values, context("banner_settings"))}
        />
      ) : null}
    </>
  );
}

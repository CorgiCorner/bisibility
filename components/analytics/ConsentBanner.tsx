"use client";

import {
  ConsentSettingsModal,
  type SaveConsent,
} from "@/components/analytics/ConsentSettingsModal";
import { consentCopy } from "@/components/analytics/consent-copy";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Portal } from "@/components/ui/Portal";
import { saveAnalyticsConsent } from "@/lib/actions/analytics-consent";
import { applyAnalyticsConsent, setAnalyticsReplay } from "@/lib/analytics/client";
import { type ConsentState, pendingConsent } from "@/lib/analytics/consent";
import { restrictConsentImmediately } from "@/lib/analytics/consent-client";
import { useState } from "react";

type ConsentBannerProps = {
  initialConsent?: ConsentState;
  saveConsent?: SaveConsent;
};

export function ConsentBanner({
  saveConsent = saveAnalyticsConsent,
  initialConsent = pendingConsent(),
}: Readonly<ConsentBannerProps>) {
  const [visible, setVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function choose(analytics: boolean) {
    restrictConsentImmediately({ analytics, replay: analytics });
    setSaving(true);
    setActionError(null);
    try {
      const consent = await saveConsent({ analytics, replay: analytics });
      applyAnalyticsConsent(consent);
      setAnalyticsReplay(consent.replay);
      setVisible(false);
    } catch {
      setActionError(
        "Your choice could not be saved. Choices you turned off remain off. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      <Portal>
        <Card
          aria-label="Analytics consent"
          style={{ zIndex: 1299 }}
          className="fixed bottom-4 left-4 w-[calc(100%-2rem)] max-w-[430px] p-4 sm:bottom-5 sm:left-5"
        >
          <h2 className="sr-only">{consentCopy.banner.title}</h2>
          <p className="m-0 text-[12.5px] leading-5 text-fg-muted">
            {initialConsent.replayNeedsDecision
              ? consentCopy.banner.update
              : consentCopy.banner.body}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              className="w-full whitespace-nowrap"
              disabled={saving}
              onClick={() => void choose(false)}
              size="sm"
              variant="secondary"
            >
              Reject all
            </Button>
            <Button
              className="w-full whitespace-nowrap"
              disabled={saving}
              onClick={() => void choose(true)}
              size="sm"
              variant="secondary"
            >
              Accept all
            </Button>
            <Button
              className="w-full whitespace-nowrap"
              disabled={saving}
              onClick={() => setSettingsOpen(true)}
              size="sm"
            >
              Settings
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
          initialConsent={initialConsent}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setVisible(false)}
          open
          saveConsent={saveConsent}
        />
      ) : null}
    </>
  );
}

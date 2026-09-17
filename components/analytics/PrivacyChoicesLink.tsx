"use client";

import { ConsentSettingsModal } from "@/components/analytics/ConsentSettingsModal";
import { Button } from "@/components/ui/Button";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/analytics/consent";
import { useTranslations } from "next-intl";
import { useState } from "react";

function readConsentCookie() {
  const prefix = `${CONSENT_COOKIE}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return parseConsentCookie(value ? decodeURIComponent(value) : undefined);
}

export function PrivacyChoicesLink({ label }: Readonly<{ label?: string }>) {
  const t = useTranslations("shared.analyticsConsent");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="xs" type="button" variant="ghost">
        {label ?? t("title")}
      </Button>
      {open ? (
        <ConsentSettingsModal
          initialConsent={readConsentCookie()}
          onClose={() => setOpen(false)}
          open
        />
      ) : null}
    </>
  );
}

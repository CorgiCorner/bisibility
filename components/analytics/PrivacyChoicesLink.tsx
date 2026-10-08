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

export function PrivacyChoicesLink({
  label,
  appearance = "button",
}: Readonly<{ label?: string; appearance?: "button" | "inline" }>) {
  const t = useTranslations("shared.analyticsConsent");
  const [open, setOpen] = useState(false);

  return (
    <>
      {appearance === "inline" ? (
        <button
          type="button"
          className="appearance-none border-0 bg-transparent p-0 font-normal text-inherit leading-[inherit] cursor-pointer hover:text-accent-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid rounded-control"
          onClick={() => setOpen(true)}
        >
          {label ?? t("title")}
        </button>
      ) : (
        <Button onClick={() => setOpen(true)} size="xs" type="button" variant="ghost">
          {label ?? t("title")}
        </Button>
      )}
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

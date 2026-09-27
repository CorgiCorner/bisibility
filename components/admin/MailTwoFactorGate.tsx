"use client";

import { SecurityFactors } from "@/components/account/SecurityFactors";
import { InstanceMailSettings } from "@/components/admin/InstanceMailSettings";
import type { InstanceMailSettingsView } from "@/lib/email/instance-mail-runtime";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function MailTwoFactorGate({
  returnTo,
  settings,
}: Readonly<{ returnTo: string; settings: InstanceMailSettingsView }>) {
  const t = useTranslations("instanceAdmin.administration.mailer");
  const [enrolled, setEnrolled] = useState(settings.twoFactorEnabled);
  if (!enrolled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-xs leading-relaxed text-fg-muted">{t("descriptionLocked")}</p>
        <SecurityFactors
          hasPasswordCredential={settings.hasPasswordCredential}
          initiallyEnabled={false}
          onEnrolled={() => setEnrolled(true)}
          returnTo={returnTo}
        />
      </div>
    );
  }
  return <InstanceMailSettings settings={{ ...settings, twoFactorEnabled: true }} />;
}

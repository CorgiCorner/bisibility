"use client";
import { AdminEmailAllowance } from "@/components/admin/AdminEmailAllowance";
import {
  DangerousActionAccessProvider,
  DangerousActionGate,
} from "@/components/admin/DangerousActionGate";
import { InstanceMailSettings } from "@/components/admin/InstanceMailSettings";
import { Card } from "@/components/ui/Card";
import { ExternalLink } from "@/components/ui/ExternalLink";
import type { InstanceMailSettingsResult } from "@/lib/actions/instance-mail-settings";
import type { InstanceEmailAllowance } from "@/lib/email/allowance-model";
import type { InstanceMailSettingsView } from "@/lib/email/instance-mail-runtime";
import type { InstanceMailFormValues } from "@/lib/email/instance-mail-schema";
import { DOCS_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";

export function OssEmailAllowance({ allowance }: { allowance: InstanceEmailAllowance }) {
  return <AdminEmailAllowance allowance={allowance} />;
}

export function OssInstanceMailForm({
  busy = false,
  twoFactorEnabled,
  settings,
  mailerConfigured,
  onSaveMail,
  onClearMail,
}: {
  busy?: boolean;
  twoFactorEnabled: boolean;
  settings?: InstanceMailSettingsView;
  mailerConfigured?: boolean;
  onSaveMail: (
    settings: InstanceMailFormValues,
  ) => InstanceMailSettingsResult | undefined | Promise<InstanceMailSettingsResult | undefined>;
  onClearMail: () =>
    | InstanceMailSettingsResult
    | undefined
    | Promise<InstanceMailSettingsResult | undefined>;
}) {
  const t = useTranslations("instanceAdmin.administration.mailer");
  const page = useTranslations("instanceAdmin.pages");
  const mailSettings = settings ?? {
    credentialsConfigured: false,
    envOverridesSaved: false,
    hasPasswordCredential: false,
    provider: "smtp",
    sender: "",
    twoFactorEnabled,
  };
  return (
    <div className="grid gap-4">
      {mailerConfigured === false && (
        <Card data-testid="oss-mail-warning" component="section" size="lg">
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <p className="mt-2 text-xs text-fg-muted">{t("descriptionReady")}</p>
          <ExternalLink
            href={`${DOCS_URL}/self-hosting/email`}
            className="mt-3 text-xs font-semibold"
          >
            {t("link")}
          </ExternalLink>
        </Card>
      )}
      <section data-testid="oss-mail" aria-labelledby="oss-mail-heading" className="grid gap-2">
        <h3 id="oss-mail-heading" className="text-sm font-semibold">
          {page("mail")}
        </h3>
        <DangerousActionAccessProvider allowed={twoFactorEnabled}>
          <div role={twoFactorEnabled ? undefined : "status"}>
            <DangerousActionGate action="changeMail">
              <InstanceMailSettings
                settings={mailSettings}
                busy={busy}
                onSaveSettings={onSaveMail}
                onClearSettings={onClearMail}
              />
            </DangerousActionGate>
          </div>
        </DangerousActionAccessProvider>
      </section>
    </div>
  );
}

import { MailTwoFactorGate } from "@/components/admin/MailTwoFactorGate";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { Card } from "@/components/ui/Card";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { isFirstRun, isFirstRunAdministratorPending } from "@/lib/auth/first-run";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { requireSession } from "@/lib/auth/session";
import { isSelfHost } from "@/lib/deployment/deployment";
import {
  loadInstanceMailSettingsView,
  refreshInstanceMailRuntime,
} from "@/lib/email/instance-mail-store";
import { isEmailConfigured } from "@/lib/email/registry";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import packageJson from "@/package.json";
import type { Metadata } from "next";
import Link from "next/link";
import { signOutAndSwitchAccountAction } from "./actions";
import { SetupAccountStatusCard } from "./SetupAccountStatusCard";
import { SetupRecoveryAction } from "./SetupRecoveryAction";
import { SetupStepper } from "./SetupStepper";
import { SetupSuccess } from "./SetupSuccess";
import { SetupWizard } from "./SetupWizard";

export const dynamic = "force-dynamic";

async function setupTranslator() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["setup"]);
  return createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await setupTranslator();
  return createNoindexMetadata({
    title: t("setup.metadata.title"),
    description: t("setup.metadata.description"),
  });
}

function SetupFrame({
  children,
  versionLabel,
}: Readonly<{ children: React.ReactNode; versionLabel: string }>) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-fg">
      <div className="flex w-full max-w-[480px] flex-col gap-4.5">
        <Link className="inline-flex justify-center no-underline" href="/">
          <BrandLockup />
        </Link>
        {children}
        <p className="m-0 text-center text-[10.5px] text-fg-muted tabular-nums">{versionLabel}</p>
      </div>
    </main>
  );
}

export default async function SetupPage() {
  const t = await setupTranslator();
  await refreshInstanceMailRuntime();
  const versionLabel = t("setup.frame.version", { version: packageJson.version });
  if (await isFirstRun()) {
    return (
      <SetupFrame versionLabel={versionLabel}>
        <Card className="p-7" size="lg">
          <SetupWizard mailerConfigured={isEmailConfigured()} />
        </Card>
      </SetupFrame>
    );
  }

  await requireSession();
  if (await getInstanceAdminSession()) {
    const mailerConfigured = isEmailConfigured();
    const mailSettings =
      isSelfHost && !mailerConfigured ? await loadInstanceMailSettingsView() : null;
    return (
      <SetupFrame versionLabel={versionLabel}>
        <Card className="p-7" size="lg">
          <div className="flex flex-col gap-5.5">
            <SetupStepper current="done" />
            <SetupSuccess
              emailNotice={mailSettings ? "hidden" : undefined}
              mailerConfigured={mailerConfigured}
            />
          </div>
        </Card>
        {mailSettings ? <MailTwoFactorGate returnTo="/setup" settings={mailSettings} /> : null}
      </SetupFrame>
    );
  }

  if (await isFirstRunAdministratorPending()) {
    return (
      <SetupFrame versionLabel={versionLabel}>
        <SetupAccountStatusCard
          administratorExists={false}
          recoveryAction={<SetupRecoveryAction />}
          switchAccountAction={signOutAndSwitchAccountAction}
        />
      </SetupFrame>
    );
  }

  return (
    <SetupFrame versionLabel={versionLabel}>
      <SetupAccountStatusCard
        administratorExists
        switchAccountAction={signOutAndSwitchAccountAction}
      />
    </SetupFrame>
  );
}

import { CloudImport, type CloudImportSource } from "@/components/cloud/CloudImport";
import { CloudTopBar, type CloudTopBarContext } from "@/components/cloud/CloudTopBar";
import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import {
  mintMigrationTokenResult,
  pollCloudImportJob,
  regenerateMigrationTokenResult,
  revokeMigrationTokenResult,
} from "@/lib/actions/cloud";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { deploymentMode } from "@/lib/deployment/deployment";
import { migrationDestinationOrigin } from "@/lib/migration/destination-origin";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getCloudImportView } from "@/lib/queries/cloud";
import { appPath } from "@/lib/routing/app-path";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { headers } from "next/headers";
import Link from "next/link";

export type CloudImportScreenContext = "app-settings" | "cloud-onboard" | "cloud-settings";

type ScreenCopy = {
  back: { href: string; label: string };
  source: CloudImportSource;
  subtitle: string;
  title: string;
  topBar?: {
    context: CloudTopBarContext;
    copy: {
      beta: string;
      fallbackWorkspace: string;
      setupProgress: (values: { current: number; total: number }) => string;
    };
  };
};

function screenCopy(
  context: CloudImportScreenContext,
  projectRef: string,
  copy: {
    backToSetup: string;
    cloudSubtitle: string;
    cloudTitle: string;
    instanceSubtitle: string;
    instanceTitle: string;
    onboardSubtitle: string;
    onboardTitle: string;
    settings: string;
    topBar: NonNullable<ScreenCopy["topBar"]>["copy"];
  },
): ScreenCopy {
  if (context === "cloud-onboard") {
    return {
      back: { href: "/onboarding?new=1", label: copy.backToSetup },
      source: "selfHost",
      subtitle: copy.onboardSubtitle,
      title: copy.onboardTitle,
      topBar: { context: "onboard", copy: copy.topBar },
    };
  }
  if (context === "cloud-settings" || deploymentMode() === "cloud") {
    return {
      back: { href: appPath(projectRef, "settings"), label: copy.settings },
      source: "selfHost",
      subtitle: copy.cloudSubtitle,
      title: copy.cloudTitle,
      topBar: context === "cloud-settings" ? { context: "settings", copy: copy.topBar } : undefined,
    };
  }
  return {
    back: { href: appPath(projectRef, "settings"), label: copy.settings },
    source: "instance",
    subtitle: copy.instanceSubtitle,
    title: copy.instanceTitle,
  };
}

export async function CloudImportScreen({
  context,
  projectRef,
}: Readonly<{ context: CloudImportScreenContext; projectRef: string }>) {
  const [view, readable, runtime, dateFormat] = await Promise.all([
    getCloudImportView(projectRef),
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
    getResolvedDateFormat(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "cloudImport"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const config = screenCopy(context, view.project.publicId, {
    backToSetup: t("cloudImport.screen.backToSetup"),
    cloudSubtitle: t("cloudImport.screen.cloudSubtitle"),
    cloudTitle: t("cloudImport.screen.cloudTitle"),
    instanceSubtitle: t("cloudImport.screen.instanceSubtitle"),
    instanceTitle: t("cloudImport.screen.instanceTitle"),
    onboardSubtitle: t("cloudImport.screen.onboardSubtitle"),
    onboardTitle: t("cloudImport.screen.onboardTitle"),
    settings: t("cloudImport.screen.settings"),
    topBar: {
      beta: t("cloudImport.topBar.beta"),
      fallbackWorkspace: t("cloudImport.topBar.fallbackWorkspace"),
      setupProgress: (values) => t("cloudImport.topBar.setupProgress", values),
    },
  });
  const role = getProjectRole(readable.actor, readable.project.id);
  const destinationUrl = migrationDestinationOrigin(await headers(), deploymentMode());

  return (
    <>
      {config.topBar ? (
        <CloudTopBar
          copy={config.topBar.copy}
          ctx={config.topBar.context}
          workspaceName={view.project.name}
        />
      ) : null}
      <Link
        className="mt-7 inline-flex items-center gap-1.5 font-sans tabular-nums text-[12px] font-semibold text-fg-muted transition-colors hover:text-fg"
        href={config.back.href}
      >
        <ArrowLeft aria-hidden size={13} weight="regular" />
        {config.back.label}
      </Link>
      {config.topBar ? (
        <header className="mt-4">
          <h1 className="text-[26px] font-semibold tracking-[-0.8px]">{config.title}</h1>
          <p className="mt-2 max-w-[520px] text-[14px] leading-[1.6] text-fg-muted">
            {config.subtitle}
          </p>
        </header>
      ) : null}
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <DateFormatProvider value={dateFormat.resolved}>
          <DateDisplayProvider>
            <CloudImport
              activeToken={view.activeToken}
              canManage={canProjectAction(role, "manage", "migration_token")}
              destinationUrl={destinationUrl}
              importJob={view.importJob}
              mintMigrationTokenAction={mintMigrationTokenResult}
              pollJobAction={pollCloudImportJob}
              projectReadOnly={view.project.writeMode !== "active"}
              projectId={view.project.publicId}
              regenerateMigrationTokenAction={regenerateMigrationTokenResult}
              revokeMigrationTokenAction={revokeMigrationTokenResult}
              source={config.source}
              workspaceName={view.project.name}
            />
          </DateDisplayProvider>
        </DateFormatProvider>
      </FeatureMessagesProvider>
    </>
  );
}

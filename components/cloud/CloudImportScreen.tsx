import { CloudImport, type CloudImportCopy } from "@/components/cloud/CloudImport";
import { CloudTopBar, type CloudTopBarContext } from "@/components/cloud/CloudTopBar";
import {
  mintMigrationTokenResult,
  pollCloudImportJob,
  regenerateMigrationTokenResult,
  revokeMigrationTokenResult,
} from "@/lib/actions/cloud";
import { exportCloudImportPackage } from "@/lib/actions/keyword-import-export";
import { enableMigrationHold, releaseMigrationHold } from "@/lib/actions/project-write-mode";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isCloud } from "@/lib/deployment/deployment";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getCloudImportView } from "@/lib/queries/cloud";
import { appPath } from "@/lib/routing/app-path";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export type CloudImportScreenContext = "app-settings" | "cloud-onboard" | "cloud-settings";

type ScreenCopy = {
  back: { href: string; label: string };
  copy: CloudImportCopy;
  subtitle: string;
  title: string;
  topBar?: CloudTopBarContext;
};

const cloudCopy: CloudImportCopy = {
  sourceLabel: "self-hosted instance",
  tokenSecurityNote:
    "The token grants import access to this workspace only, never your providers or billing. It expires automatically and can be revoked any time before use.",
  transferInstruction:
    "Open Migrate to Cloud / Transfer, choose Push to Cloud, and paste this token to start the import.",
};

const instanceCopy: CloudImportCopy = {
  sourceLabel: "source instance",
  tokenSecurityNote:
    "The token grants import access to this workspace only, never provider credentials. It expires automatically and can be revoked any time before use.",
  transferInstruction:
    "Open the migration wizard on the source instance, choose Push, and paste this token to start the import.",
};

function screenCopy(context: CloudImportScreenContext, projectRef: string): ScreenCopy {
  if (context === "cloud-onboard") {
    return {
      back: { href: "/onboarding?new=1", label: "Back to setup" },
      copy: cloudCopy,
      subtitle: "This becomes your new Cloud workspace.",
      title: "Import your self-hosted data",
      topBar: "onboard",
    };
  }
  if (context === "cloud-settings" || isCloud) {
    return {
      back: { href: appPath(projectRef, "settings"), label: "Settings" },
      copy: cloudCopy,
      subtitle:
        "Create a one-time token that lets a self-hosted instance push its data into this workspace.",
      title: "Import from self-host",
      topBar: context === "cloud-settings" ? "settings" : undefined,
    };
  }
  return {
    back: { href: appPath(projectRef, "settings"), label: "Settings" },
    copy: instanceCopy,
    subtitle:
      "Create a one-time token that lets another instance push its data into this workspace.",
    title: "Import from another instance",
  };
}

export async function CloudImportScreen({
  context,
  projectRef,
}: Readonly<{ context: CloudImportScreenContext; projectRef: string }>) {
  const [view, readable] = await Promise.all([
    getCloudImportView(projectRef),
    requireReadableProject(projectRef),
  ]);
  const config = screenCopy(context, view.project.publicId);
  const role = getProjectRole(readable.actor, readable.project.id);

  return (
    <>
      {config.topBar ? <CloudTopBar ctx={config.topBar} workspaceName={view.project.name} /> : null}
      <Link
        className="mt-7 inline-flex items-center gap-1.5 font-mono text-[12px] font-semibold text-fg-muted transition-colors hover:text-fg"
        href={config.back.href}
      >
        <ArrowLeft aria-hidden size={13} weight="bold" />
        {config.back.label}
      </Link>
      <header className="mt-4">
        <h1 className="text-[26px] font-semibold tracking-[-0.8px]">{config.title}</h1>
        <p className="mt-2 max-w-[520px] text-[14px] leading-[1.6] text-fg-muted">
          {config.subtitle}
        </p>
      </header>
      <CloudImport
        activeToken={view.activeToken}
        canManage={canProjectAction(role, "manage", "migration_token")}
        copy={config.copy}
        enableMigrationHoldAction={enableMigrationHold}
        exportPackageAction={exportCloudImportPackage}
        importJob={view.importJob}
        mintMigrationTokenAction={mintMigrationTokenResult}
        pollJobAction={pollCloudImportJob}
        projectReadOnly={view.project.writeMode !== "active"}
        projectId={view.project.publicId}
        regenerateMigrationTokenAction={regenerateMigrationTokenResult}
        releaseMigrationHoldAction={releaseMigrationHold}
        revokeMigrationTokenAction={revokeMigrationTokenResult}
        workspaceName={view.project.name}
      />
    </>
  );
}

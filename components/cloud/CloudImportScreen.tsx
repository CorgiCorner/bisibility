import { CloudImport, type CloudImportCopy } from "@/components/cloud/CloudImport";
import { CloudTopBar, type CloudTopBarContext } from "@/components/cloud/CloudTopBar";
import {
  mintMigrationTokenResult,
  pollCloudImportJob,
  regenerateMigrationTokenResult,
  revokeMigrationTokenResult,
} from "@/lib/actions/cloud";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { deploymentMode } from "@/lib/deployment/deployment";
import { migrationDestinationOrigin } from "@/lib/migration/destination-origin";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getCloudImportView } from "@/lib/queries/cloud";
import { appPath } from "@/lib/routing/app-path";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { headers } from "next/headers";
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
    "The token grants import access to this project only, never your providers or billing. It expires automatically and can be revoked any time before use.",
};

const instanceCopy: CloudImportCopy = {
  sourceLabel: "source instance",
  tokenSecurityNote:
    "The token grants import access to this project only, never provider credentials. It expires automatically and can be revoked any time before use.",
};

function screenCopy(context: CloudImportScreenContext, projectRef: string): ScreenCopy {
  if (context === "cloud-onboard") {
    return {
      back: { href: "/onboarding?new=1", label: "Back to setup" },
      copy: cloudCopy,
      subtitle: "This becomes your new hosted project.",
      title: "Import your self-hosted data",
      topBar: "onboard",
    };
  }
  if (context === "cloud-settings" || deploymentMode() === "cloud") {
    return {
      back: { href: appPath(projectRef, "settings"), label: "Settings" },
      copy: cloudCopy,
      subtitle:
        "Create a one-time token that lets a self-hosted instance push its data into this project.",
      title: "Import from self-host",
      topBar: context === "cloud-settings" ? "settings" : undefined,
    };
  }
  return {
    back: { href: appPath(projectRef, "settings"), label: "Settings" },
    copy: instanceCopy,
    subtitle: "Create a one-time token that lets another instance push its data into this project.",
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
  const destinationUrl = migrationDestinationOrigin(await headers(), deploymentMode());

  return (
    <>
      {config.topBar ? <CloudTopBar ctx={config.topBar} workspaceName={view.project.name} /> : null}
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
      <CloudImport
        activeToken={view.activeToken}
        canManage={canProjectAction(role, "manage", "migration_token")}
        copy={config.copy}
        destinationUrl={destinationUrl}
        importJob={view.importJob}
        mintMigrationTokenAction={mintMigrationTokenResult}
        pollJobAction={pollCloudImportJob}
        projectReadOnly={view.project.writeMode !== "active"}
        projectId={view.project.publicId}
        regenerateMigrationTokenAction={regenerateMigrationTokenResult}
        revokeMigrationTokenAction={revokeMigrationTokenResult}
        workspaceName={view.project.name}
      />
    </>
  );
}

"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { CopyButton } from "@/components/ui/CopyButton";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { loopbackTunnelCommand, migrationTargetHostKind } from "@/lib/migration/target-host";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export const QUICK_TUNNEL_DOCS_HREF =
  "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/";

export type MigrationReachabilityCopy = {
  copy: string;
  destinationFollowUp: ReactNode;
  intro: string;
  runningLocal: string;
  sourceFollowUp: ReactNode;
  unreachable: string;
};

export function MigrationReachabilityHint({
  copy,
  surface = "source",
  targetOrigin,
  unreachable = false,
}: Readonly<{
  copy: MigrationReachabilityCopy;
  surface?: "destination" | "source";
  targetOrigin: string;
  unreachable?: boolean;
}>) {
  const deploymentMode = useDeploymentMode();
  if (deploymentMode !== "self-host") return null;

  const kind = migrationTargetHostKind(targetOrigin);
  if (kind === "loopback") {
    const command = loopbackTunnelCommand(targetOrigin);
    return (
      <div className="rounded-control border border-border bg-bg-sunken px-3.5 py-3 text-[12.5px] leading-[1.5] text-fg-muted">
        <div className="font-semibold text-fg">{copy.runningLocal}</div>
        <p className="m-0 mt-1">{copy.intro}</p>
        <div className="mt-2 flex items-center gap-2 rounded-control border border-border bg-bg px-2.5 py-2">
          <code className="min-w-0 flex-1 wrap-break-word font-sans tabular-nums text-[11.5px] font-medium text-fg">
            {command}
          </code>
          <CopyButton label={copy.copy} size="sm" text={command} />
        </div>
        <p className="m-0 mt-2">
          {surface === "destination" ? copy.destinationFollowUp : copy.sourceFollowUp}
        </p>
      </div>
    );
  }

  if (kind === "private" && unreachable) {
    return <p className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">{copy.unreachable}</p>;
  }

  return null;
}

/** Supplies the migration route's scoped catalog to the shared presentation component. */
export function LocalizedMigrationReachabilityHint(
  props: Readonly<Omit<Parameters<typeof MigrationReachabilityHint>[0], "copy">>,
) {
  const t = useTranslations("projectSettingsMigration.reachability");
  const learnMore = (chunks: ReactNode) => (
    <ExternalLink className="font-semibold text-accent-text" href={QUICK_TUNNEL_DOCS_HREF}>
      {chunks}
    </ExternalLink>
  );
  return (
    <MigrationReachabilityHint
      {...props}
      copy={{
        copy: t("copy"),
        destinationFollowUp: t.rich("destinationFollowUp", { learnMore }),
        intro: t("intro"),
        runningLocal: t("runningLocal"),
        sourceFollowUp: t.rich("sourceFollowUp", { learnMore }),
        unreachable: t("unreachable"),
      }}
    />
  );
}

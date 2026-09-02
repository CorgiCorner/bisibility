"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { CopyButton, ExternalLink } from "@/components/ui";
import { loopbackTunnelCommand, migrationTargetHostKind } from "@/lib/migration/target-host";

const QUICK_TUNNEL_DOCS_HREF =
  "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/";

export function MigrationReachabilityHint({
  surface = "source",
  targetOrigin,
  unreachable = false,
}: Readonly<{
  surface?: "destination" | "source";
  targetOrigin: string;
  unreachable?: boolean;
}>) {
  const deploymentMode = useDeploymentMode();
  if (deploymentMode !== "self-host") return null;

  const kind = migrationTargetHostKind(targetOrigin);
  if (kind === "loopback") {
    const command = loopbackTunnelCommand(targetOrigin);
    const followUp =
      surface === "destination"
        ? "Use the generated HTTPS URL as the Destination URL on the source, and keep the command running until the transfer finishes."
        : "Paste the generated HTTPS URL here and keep the command running until the transfer finishes.";
    return (
      <div className="rounded-control border border-border bg-bg-sunken px-3.5 py-3 text-[12.5px] leading-[1.5] text-fg-muted">
        <div className="font-semibold text-fg">Running locally?</div>
        <p className="m-0 mt-1">Create a temporary public URL with Cloudflare Quick Tunnel:</p>
        <div className="mt-2 flex items-center gap-2 rounded-control border border-border bg-bg px-2.5 py-2">
          <code className="min-w-0 flex-1 wrap-break-word font-sans tabular-nums text-[11.5px] font-medium text-fg">
            {command}
          </code>
          <CopyButton label="Copy tunnel command" size="sm" text={command} />
        </div>
        <p className="m-0 mt-2">
          {followUp}{" "}
          <ExternalLink className="font-semibold text-accent-text" href={QUICK_TUNNEL_DOCS_HREF}>
            Learn more
          </ExternalLink>
        </p>
      </div>
    );
  }

  if (kind === "private" && unreachable) {
    return (
      <p className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">
        If the destination is not reachable from this instance, use a temporary Cloudflare Tunnel or
        import a ZIP package.
      </p>
    );
  }

  return null;
}

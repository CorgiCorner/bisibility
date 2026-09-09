"use client";

import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { appPath } from "@/lib/routing/app-path";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/csr/Link";

const bullets = [
  "Runs on your own DataForSEO key, price shown before every run",
  "Snapshots cached for 24 hours - reopening and re-slicing is free",
  "Every refresh diffs against the last snapshot: new and lost links flagged",
] as const;

export function BacklinksIdleState({
  projectRef,
  state = "idle",
}: Readonly<{
  projectRef: string;
  state?: "idle" | "needs_reauth" | "no_provider";
}>) {
  const providerBlocked = state !== "idle";
  return (
    <section aria-label="Backlinks introduction">
      <EmptyState
        action={
          providerBlocked ? (
            <AccentCtaLink href={appPath(projectRef, "integrations")}>
              {state === "needs_reauth" ? "Reconnect DataForSEO" : "Connect DataForSEO"}
            </AccentCtaLink>
          ) : undefined
        }
        bullets={providerBlocked ? undefined : [...bullets]}
        description={
          providerBlocked
            ? state === "needs_reauth"
              ? "Reconnect this project's DataForSEO credentials to resume backlink analysis."
              : "Backlinks requires a provider with backlink intelligence support. Lookups run on your own key."
            : undefined
        }
        mark={<ModuleMark bordered icon={Link} />}
        title={
          providerBlocked
            ? state === "needs_reauth"
              ? "DataForSEO needs to be reconnected"
              : "Connect DataForSEO to analyze backlinks"
            : "Point it at any domain"
        }
      />
    </section>
  );
}

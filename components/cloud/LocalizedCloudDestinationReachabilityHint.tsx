"use client";

import {
  MigrationReachabilityHint,
  QUICK_TUNNEL_DOCS_HREF,
} from "@/components/settings/migration/MigrationReachabilityHint";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** Supplies destination-owned copy while the shared reachability view remains message-free. */
export function LocalizedCloudDestinationReachabilityHint(
  props: Readonly<Omit<Parameters<typeof MigrationReachabilityHint>[0], "copy">>,
) {
  const t = useTranslations("cloudImport.reachability");
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

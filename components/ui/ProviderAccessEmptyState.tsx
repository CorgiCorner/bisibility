"use client";

import { BinocularsIcon } from "@phosphor-icons/react/dist/csr/Binoculars";
import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { ProviderAccessActions } from "./ProviderAccessActions";

const moduleIcons = {
  keywords: BinocularsIcon,
  domain: GlobeIcon,
  backlinks: LinkIcon,
  ai: SparkleIcon,
};

export function ProviderAccessEmptyState({
  href,
  providers = [],
  reconnect = false,
  surface = "keywords",
}: Readonly<{
  href: string;
  providers?: readonly string[];
  reconnect?: boolean;
  surface?: keyof typeof moduleIcons;
}>) {
  const t = useTranslations("shared.providerAccess");
  const available = providers.length > 0 || reconnect;
  const title = t(available ? (reconnect ? "reconnectTitle" : "emptyTitle") : "unavailableTitle");
  const Icon = moduleIcons[surface];
  return (
    <section aria-label={title} data-provider-empty-state>
      <EmptyState
        title={title}
        icon={<Icon aria-hidden size={28} weight="regular" />}
        description={
          available ? (
            <div className="grid gap-1.5">
              <span>{t(reconnect ? "reconnectDescription" : "emptyDescription")}</span>
              {providers.length ? (
                <span>{t("supported", { providers: providers.join(", ") })}</span>
              ) : null}
            </div>
          ) : (
            t("unavailable")
          )
        }
        action={
          <ProviderAccessActions
            href={href}
            providers={providers}
            reconnect={reconnect}
            surface={surface}
          >
            <Button asChild>
              <Link href={href}>
                {t(available ? (reconnect ? "reconnectAction" : "connectAction") : "action")}
              </Link>
            </Button>
          </ProviderAccessActions>
        }
      />
    </section>
  );
}

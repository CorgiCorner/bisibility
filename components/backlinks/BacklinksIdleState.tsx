"use client";

import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { appPath } from "@/lib/routing/app-path";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/csr/Link";
import { useTranslations } from "next-intl";

export function BacklinksIdleState({
  projectRef,
  state = "idle",
}: Readonly<{
  projectRef: string;
  state?: "idle" | "needs_reauth" | "no_provider";
}>) {
  const t = useTranslations("projectBacklinks.workspace.idle");
  const bullets = [t("bullets.price"), t("bullets.cache"), t("bullets.diff")];
  const providerBlocked = state !== "idle";
  return (
    <section aria-label={t("aria")}>
      <EmptyState
        action={
          providerBlocked ? (
            <AccentCtaLink href={appPath(projectRef, "integrations")}>
              {state === "needs_reauth" ? t("reconnect") : t("connect")}
            </AccentCtaLink>
          ) : undefined
        }
        bullets={providerBlocked ? undefined : [...bullets]}
        description={
          providerBlocked
            ? state === "needs_reauth"
              ? t("reauthDescription")
              : t("noProviderDescription")
            : undefined
        }
        mark={<ModuleMark bordered icon={Link} />}
        title={
          providerBlocked
            ? state === "needs_reauth"
              ? t("reauthTitle")
              : t("noProviderTitle")
            : t("idleTitle")
        }
      />
    </section>
  );
}

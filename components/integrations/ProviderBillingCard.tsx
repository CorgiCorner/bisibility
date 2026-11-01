"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { providerIcon } from "@/lib/integrations/provider-icon";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type BillingConnection = {
  connectionId: string;
  providerId: string;
  label: string;
  credentialSource: "own" | "hosted";
  billable: boolean;
};

type Group = "credits" | "own" | "free";

function BillingRow({ group, items }: { group: Group; items: readonly BillingConnection[] }) {
  const t = useTranslations("projectIntegrations.billingSources");
  const [expanded, setExpanded] = useState(false);
  const hidden = Math.max(0, items.length - 6);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 px-3 py-2.5 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center">
      <dt className="min-w-0">
        <p className="m-0 text-sm font-medium">
          {t(`${group}Title`)}{" "}
          <span className="font-normal text-fg-muted tabular-nums">{items.length}</span>
        </p>
        <p className="m-0 text-xs text-fg-muted">{t(`${group}Help`)}</p>
      </dt>
      <dd className="m-0 min-w-0">
        <ul className="m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0">
          {(expanded ? items : items.slice(0, 6)).map((item) => {
            const catalog = PROVIDER_CATALOG.find((entry) => entry.id === item.providerId);
            return (
              <li
                key={item.connectionId}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border py-0.5 pr-2.5 pl-0.5"
              >
                <ProviderLogo
                  alt=""
                  domain={catalog?.logoDomain}
                  fallbackIcon={providerIcon(item.providerId, catalog?.kind ?? "serp")}
                  size="xs"
                  tint={catalog?.kind === "analytics" ? "var(--blue)" : "var(--accent)"}
                />
                <span className="min-w-0 break-words text-sm">{item.label}</span>
              </li>
            );
          })}
          {hidden > 0 && (
            <li>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                className="rounded-full border border-border px-2.5 py-0.5 text-sm text-fg-muted hover:bg-bg-band"
              >
                {expanded ? t("showLess") : t("more", { count: String(hidden) })}
              </button>
            </li>
          )}
        </ul>
      </dd>
    </div>
  );
}

export function ProviderBillingCard({
  connections,
  manageHref,
}: {
  connections: readonly BillingConnection[];
  manageHref: string;
}) {
  const t = useTranslations("projectIntegrations.billingSources");
  const groups: Group[] = ["credits", "own", "free"];
  if (!connections.length) return null;
  return (
    <Card className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <Button size="xs" variant="secondary" href={manageHref}>
          {t("manage")}
        </Button>
      </div>
      <dl className="m-0 min-w-0 divide-y divide-border rounded-control border border-border">
        {groups.map((group) => {
          const items = connections.filter(
            (item) =>
              (item.billable
                ? item.credentialSource === "hosted"
                  ? "credits"
                  : "own"
                : "free") === group,
          );
          return items.length ? <BillingRow key={group} group={group} items={items} /> : null;
        })}
      </dl>
    </Card>
  );
}

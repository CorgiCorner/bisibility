"use client";

import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Card } from "@/components/ui/Card";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/usagekit/primitives/table";
import { addSummaryFigure } from "@/components/usagekit/usage-summary-cards";
import { providerIcon } from "@/lib/integrations/provider-icon";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import { providerBillingUnit } from "@/lib/providers/billing-unit";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import type { Figure } from "@usagekit/views";
import { createTranslator, useLocale } from "next-intl";
import { useState } from "react";

export type UsageDetailsMessages = {
  usageMonth: string;
  usageMonthHelp: string;
  usageMonthEmpty: string;
  usageProvider: string;
  usageAppRequests: string;
  usageApiRequests: string;
  usageBilled: string;
  mixedUnits: string;
  providerCount: string;
  partialUsage: string;
  creditsTitle: string;
  ownKeysTitle: string;
  retainedConnection: string;
};

type Amount = { figure: Figure; unit: string; provider: string };
type Entry = {
  id: string;
  provider: string;
  app: bigint | null;
  api: bigint | null;
  amounts: Map<string, Amount>;
  unknownAmounts: boolean;
};
const value = (figure: Figure | undefined): bigint | null =>
  figure &&
  figure !== "unavailable" &&
  figure.certainty !== "unknown" &&
  /^-?\d+$/.test(figure.text)
    ? BigInt(figure.text)
    : null;
// Missing figures stay unknown when combining rows, rather than implying zero.
const add = (a: bigint | null, b: bigint | null) => (a === null || b === null ? null : a + b);

function collect(data: ProjectUsageViews, source: "platform" | "byok"): Entry[] {
  const entries = new Map<string, Entry>();
  for (const row of data.detail.rows.filter((item) => item.fundingSource === source)) {
    const provider = row.dimensions.provider || "";
    const id = row.dimensions.connection || `retained:${source}:${provider}`;
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        id,
        provider,
        app: data.truncated ? null : 0n,
        api: data.truncated ? null : 0n,
        amounts: new Map(),
        unknownAmounts: false,
      };
      entries.set(id, entry);
    }
    const surface = row.dimensions.surface === "programmatic" ? "api" : "app";
    const marker = `__${surface}`;
    const requests = value(row.units.requests);
    entry[surface] = entry.amounts.has(marker) ? add(entry[surface], requests) : requests;
    entry.amounts.set(marker, { figure: "unavailable", unit: marker, provider });
    // Hosted customer charges do not reveal what the provider billed.
    const native = row.units.units;
    const figures: [string, Figure][] =
      native &&
      native !== "unavailable" &&
      native.certainty !== "unknown" &&
      (source !== "byok" || providerBillingUnit(provider))
        ? [["units", native]]
        : source === "byok"
          ? [["cents", row.cost]]
          : [["units", "unavailable"]];
    for (const [unit, figure] of figures) {
      if (
        figure === "unavailable" ||
        figure.certainty === "unknown" ||
        !/^-?\d+(?:\.\d+)?$/.test(figure.text)
      ) {
        entry.unknownAmounts = true;
        continue;
      }
      const key = unit === "units" ? `${unit}:${providerBillingUnit(provider) ?? provider}` : unit;
      const prior = entry.amounts.get(key);
      entry.amounts.set(key, {
        unit,
        provider,
        figure: prior ? addSummaryFigure(prior.figure, figure, unit) : figure,
      });
    }
  }
  return [...entries.values()].sort((a, b) => {
    const ar = (a.app ?? 0n) + (a.api ?? 0n);
    const br = (b.app ?? 0n) + (b.api ?? 0n);
    return ar === br ? a.provider.localeCompare(b.provider) : ar > br ? -1 : 1;
  });
}

function Group({
  entries,
  title,
  m,
}: {
  entries: Entry[];
  title: string;
  m: UsageDetailsMessages;
}) {
  const [open, setOpen] = useState(true);
  const p = useUsagePresentation();
  const locale = useLocale();
  const t = createTranslator({ locale, messages: { providerCount: m.providerCount } });
  const count = (n: bigint | null) => (n === null ? "-" : new Intl.NumberFormat(locale).format(n));
  const renderAmount = (a: Amount) => {
    if (a.figure === "unavailable" || a.figure.certainty === "unknown") return "-";
    const text = p.budgetFigure(a.figure);
    return text
      ? [text, p.providerUnit(a.unit, a.provider, a.figure.text)].filter(Boolean).join(" ")
      : "-";
  };
  const totals = new Map<string, Amount>();
  for (const item of entries)
    for (const [key, amount] of item.amounts) {
      if (key.startsWith("__")) continue;
      const prior = totals.get(key);
      totals.set(
        key,
        prior
          ? { ...prior, figure: addSummaryFigure(prior.figure, amount.figure, amount.unit) }
          : { ...amount },
      );
    }
  const amounts = [...totals.entries()];
  const subtotal = (surface: "app" | "api") =>
    entries.reduce<bigint | null>((sum, item) => add(sum, item[surface]), 0n);
  const appSubtotal = count(subtotal("app"));
  const apiSubtotal = count(subtotal("api"));
  return (
    <TableBody>
      <TableRow className="bg-bg-band/50 font-medium">
        <TableHead scope="rowgroup">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
            <CaretDown
              aria-hidden
              size={12}
              weight="regular"
              className={`inline-block ${open ? "" : "-rotate-90"}`}
            />{" "}
            {title}{" "}
            <span className="font-normal text-fg-muted">
              {t("providerCount", { count: entries.length })}
            </span>
          </button>
        </TableHead>
        <TableCell className="text-right tabular-nums">{appSubtotal}</TableCell>
        <TableCell className="text-right tabular-nums">{apiSubtotal}</TableCell>
        <TableCell className="text-right tabular-nums">
          {amounts.length > 1 ? (
            <Tooltip
              tone="surface"
              interactive
              semantics="description"
              content={
                <>
                  {entries.some((item) => item.unknownAmounts) && <p>{m.partialUsage}</p>}
                  <ul>
                    {amounts.map(([key, amount]) => (
                      <li key={key}>{renderAmount(amount)}</li>
                    ))}
                  </ul>
                </>
              }
            >
              <button type="button" className="cursor-help underline decoration-dotted">
                {m.mixedUnits}
              </button>
            </Tooltip>
          ) : amounts[0] ? (
            <>
              {renderAmount(amounts[0][1])}
              {entries.some((item) => item.unknownAmounts) && (
                <span className="block text-xs text-fg-muted">{m.partialUsage}</span>
              )}
            </>
          ) : (
            "-"
          )}
        </TableCell>
      </TableRow>
      {open &&
        entries.map((entry) => {
          const catalog = PROVIDER_CATALOG.find(
            (item) =>
              item.id === entry.provider.toLowerCase() ||
              item.label.toLowerCase() === entry.provider.toLowerCase(),
          );
          const parts = [...entry.amounts].filter(([key]) => !key.startsWith("__"));
          return (
            <TableRow key={entry.id}>
              <TableCell className="pl-6">
                <span className="flex items-center gap-2">
                  <ProviderLogo
                    alt=""
                    domain={catalog?.logoDomain}
                    fallbackIcon={providerIcon(
                      catalog?.id ?? entry.provider,
                      catalog?.kind ?? "serp",
                    )}
                    size="xs"
                    tint="var(--accent)"
                  />
                  {entry.provider || m.retainedConnection}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{count(entry.app)}</TableCell>
              <TableCell className="text-right tabular-nums">{count(entry.api)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {parts.length
                  ? parts.map(([key, amount]) => <div key={key}>{renderAmount(amount)}</div>)
                  : "-"}
              </TableCell>
            </TableRow>
          );
        })}
    </TableBody>
  );
}

export function UsageDetailsTable({
  data,
  messages: m,
  fundingSource,
}: {
  data: ProjectUsageViews;
  messages: UsageDetailsMessages;
  fundingSource?: "platform" | "byok";
}) {
  const groups = (["platform", "byok"] as const)
    .filter((source) => !fundingSource || fundingSource === source)
    .map((source) => ({ source, entries: collect(data, source) }))
    .filter((group) => group.entries.length);
  return (
    <Card className="min-w-0 space-y-3 overflow-hidden p-0">
      <div className="space-y-1 px-4 py-4">
        <h2 className="text-base font-semibold">{m.usageMonth}</h2>
        <p className="text-xs text-fg-muted">
          {groups.length ? m.usageMonthHelp : m.usageMonthEmpty}
        </p>
      </div>
      {groups.length > 0 && (
        <Table className="min-w-[480px]">
          <TableHeader className="bg-bg-band">
            <TableRow>
              <TableHead>{m.usageProvider}</TableHead>
              <TableHead className="text-right">{m.usageAppRequests}</TableHead>
              <TableHead className="text-right">{m.usageApiRequests}</TableHead>
              <TableHead className="text-right">{m.usageBilled}</TableHead>
            </TableRow>
          </TableHeader>
          {groups.map(({ source, entries }) => (
            <Group
              key={source}
              entries={entries}
              title={source === "platform" ? m.creditsTitle : m.ownKeysTitle}
              m={m}
            />
          ))}
        </Table>
      )}
    </Card>
  );
}

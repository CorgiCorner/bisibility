import { type CostKind, costCatalog } from "./catalog";
import type { CostBilling, CostPriceChange, CostSplit } from "./monthly";
import {
  equalCostBasisPoints,
  itemMonthlyMinor,
  projectMonthlyMinor,
  regularMonthlyMinor,
} from "./monthly";
import { activePriceNote } from "./schedule";
import { type CostTiles, costTiles } from "./tiles";

export type StoredCostItem = {
  amountMinor: number;
  billing: CostBilling;
  catalogKey: string | null;
  currency: string;
  endedOn: string | null;
  name: string;
  kind: CostKind;
  planLabel: string;
  priceChanges: CostPriceChange[];
  projects: { basisPoints: number | null; id: string; name: string; publicId: string }[];
  publicId: string;
  split: CostSplit;
  startedOn: string;
};

export type CostRow = {
  amountMinor: number;
  billing: CostBilling;
  catalogKey: string | null;
  currency: string;
  endedOn: string | null;
  id: string;
  itemMonthlyMinor: number;
  kind: CostKind;
  logoDomain: string | null;
  name: string;
  note: { percent: number; until: string } | { trial: true; until: string } | null;
  planLabel: string;
  priceChanges: CostPriceChange[];
  projectShareMinor: number;
  projects: { basisPoints: number | null; id?: string; name: string; publicId: string }[];
  split: CostSplit;
  startedOn: string;
};

export function visibleCostItem(
  item: Pick<StoredCostItem, "billing" | "endedOn" | "startedOn">,
  month: string,
) {
  const started = item.startedOn.slice(0, 7);
  if (item.billing === "one_off") return started === month;
  if (started > month) return false;
  return !item.endedOn || item.endedOn.slice(0, 7) >= month;
}

export function presentUsageCosts(input: {
  items: readonly StoredCostItem[];
  month: string;
  projectId: string;
  providerMinor: number;
  today: string;
}): { rows: CostRow[]; tiles: CostTiles } {
  const logos = new Map(costCatalog().map((entry) => [entry.key, entry.logoDomain]));
  const rows = input.items
    .filter((item) => visibleCostItem(item, input.month))
    .map((item) => {
      const model = {
        amountMinor: item.amountMinor,
        billing: item.billing,
        endedOn: item.endedOn,
        priceChanges: item.priceChanges,
        projects: item.projects.map((project) => ({
          basisPoints: project.basisPoints,
          projectId: project.id,
        })),
        split: item.split,
        startedOn: item.startedOn,
      };
      const equalShares =
        item.split === "equal"
          ? equalCostBasisPoints(
              regularMonthlyMinor(item.billing, item.amountMinor),
              model.projects,
            )
          : [];
      return {
        amountMinor: item.amountMinor,
        billing: item.billing,
        catalogKey: item.catalogKey,
        currency: item.currency,
        endedOn: item.endedOn,
        id: item.publicId,
        itemMonthlyMinor: itemMonthlyMinor(model, input.month),
        kind: item.kind,
        logoDomain: item.catalogKey ? (logos.get(item.catalogKey) ?? null) : null,
        name: item.name,
        note: activePriceNote(item.amountMinor, item.priceChanges, input.today),
        planLabel: item.planLabel,
        priceChanges: item.priceChanges,
        projectShareMinor: projectMonthlyMinor(model, input.projectId, input.month),
        projects: item.projects.map((project) => ({
          basisPoints:
            item.split === "equal"
              ? (equalShares.find((share) => share.projectId === project.id)?.basisPoints ?? null)
              : project.basisPoints,
          name: project.name,
          publicId: project.publicId,
        })),
        split: item.split,
        startedOn: item.startedOn,
      };
    });
  return {
    rows,
    tiles: costTiles(
      rows.map((row) => ({
        billing: row.billing,
        currency: row.currency,
        shareMinor: row.projectShareMinor,
      })),
      input.providerMinor > 0 ? { currency: "USD", minor: input.providerMinor } : null,
    ),
  };
}

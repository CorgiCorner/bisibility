import type { CostKind } from "./catalog";
import type { CostFormValues } from "./input";
import { COST_CURRENCIES, minorToMajor } from "./money";
import {
  type CostBilling,
  type CostSplit,
  equalCostBasisPoints,
  regularMonthlyMinor,
} from "./monthly";
import { formFromChanges } from "./schedule";

export function emptyCostForm(projectPublicId: string, today: string): CostFormValues {
  return {
    amount: "",
    billing: "monthly",
    catalogKey: "",
    currency: "USD",
    discountAmount: "",
    discountMode: "none",
    discountMonths: "1",
    discountPercent: "",
    discountSpan: "months",
    discountUntil: "",
    kind: "custom",
    name: "",
    percents: { [projectPublicId]: "100" },
    planLabel: "",
    projectIds: [projectPublicId],
    split: "single_project",
    startedOn: today,
    trialUntil: "",
  };
}

type StoredFormSource = {
  amountMinor: number;
  billing: CostBilling;
  catalogKey: string | null;
  currency: string;
  kind: CostKind;
  name: string;
  planLabel: string;
  priceChanges: {
    amountMinor: number;
    effectiveFrom: string;
    reason: "discount" | "regular" | "trial";
  }[];
  projects: { basisPoints: number | null; id?: string; publicId: string }[];
  split: CostSplit;
  startedOn: string;
};

export function formFromStored(item: StoredFormSource, projectPublicId: string): CostFormValues {
  const prices = formFromChanges(item.amountMinor, item.priceChanges);
  const currency = (COST_CURRENCIES as readonly string[]).includes(item.currency)
    ? (item.currency as CostFormValues["currency"])
    : "USD";
  const percent = storedSharePercent(item, projectPublicId);
  const partial = item.split !== "single_project" && percent < 100;
  return {
    amount: minorToMajor(item.amountMinor, currency),
    billing: item.billing,
    catalogKey: item.catalogKey ?? "",
    currency,
    ...prices,
    discountAmount:
      prices.discountMode === "amount" ? minorToMajor(Number(prices.discountAmount), currency) : "",
    kind: item.kind,
    name: item.name,
    percents: { [projectPublicId]: String(partial ? percent : 100) },
    planLabel: item.planLabel,
    projectIds: [projectPublicId],
    split: partial ? "percent" : "single_project",
    startedOn: item.startedOn,
    trialUntil: prices.trialUntil,
  };
}

/** Equal items open as the percent this project already receives. */
function storedSharePercent(item: StoredFormSource, projectPublicId: string) {
  if (item.split === "percent") {
    const basis = item.projects.find(
      (project) => project.publicId === projectPublicId,
    )?.basisPoints;
    return basis == null ? 100 : basis / 100;
  }
  if (item.split !== "equal") return 100;
  const storedBasis = item.projects.find(
    (project) => project.publicId === projectPublicId,
  )?.basisPoints;
  if (storedBasis != null) return storedBasis / 100;
  const shares = equalCostBasisPoints(
    regularMonthlyMinor(item.billing, item.amountMinor),
    item.projects.map((project) => ({
      basisPoints: null,
      projectId: project.id ?? project.publicId,
    })),
  );
  const mine = item.projects.find((project) => project.publicId === projectPublicId);
  return (
    (shares.find((share) => share.projectId === (mine?.id ?? projectPublicId))?.basisPoints ?? 0) /
    100
  );
}

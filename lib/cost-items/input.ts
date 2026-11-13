import { z } from "zod";
import type { CostKind } from "./catalog";
import { COST_CURRENCIES, majorToMinor } from "./money";
import {
  COST_BILLINGS,
  COST_SPLITS,
  type CostBilling,
  type CostProjectShare,
  type CostSplit,
  monthKey,
  PERCENT_BASIS,
  regularMonthlyMinor,
  splitMinor,
} from "./monthly";
import type { DiscountDraft } from "./schedule";

export const COST_KINDS = ["seo_tool", "ai", "analytics", "custom"] as const;
const MAX_MINOR = 1_000_000_000;

const discountSchema = z.object({
  amountMinor: z.number().int().nonnegative().nullable(),
  mode: z.enum(["amount", "percent"]),
  months: z.number().int().min(1).max(36).nullable(),
  percent: z.number().int().min(1).max(99).nullable(),
  until: z.string().nullable(),
});

export const costItemInputSchema = z
  .object({
    amountMinor: z.number().int().nonnegative().max(MAX_MINOR),
    billing: z.enum(COST_BILLINGS),
    catalogKey: z.string().trim().min(1).max(64).nullable(),
    currency: z.enum(COST_CURRENCIES),
    discount: discountSchema.nullable(),
    kind: z.enum(COST_KINDS),
    name: z.string().trim().min(1).max(120),
    planLabel: z.string().trim().max(80),
    projectId: z.string().trim().min(1).max(120),
    projects: z
      .array(
        z.object({
          basisPoints: z.number().int().min(0).max(PERCENT_BASIS).nullable(),
          projectPublicId: z.string().trim().min(1).max(120),
        }),
      )
      .min(1)
      .max(20),
    publicId: z.string().trim().min(1).max(80).optional(),
    split: z.enum(COST_SPLITS),
    startedOn: z.string(),
    trialUntil: z.string().nullable(),
  })
  .superRefine((value, context) => {
    issue(context, !isDate(value.startedOn), "date", ["startedOn"]);
    issue(
      context,
      Boolean(value.trialUntil) &&
        (!isDate(value.trialUntil ?? "") || (value.trialUntil ?? "") < value.startedOn),
      "trial",
      ["trialUntil"],
    );
    refineDiscount(value, context);
    refineSplit(value, context);
  });

export type CostItemInput = z.infer<typeof costItemInputSchema>;

export type CostFormValues = {
  amount: string;
  billing: CostBilling;
  catalogKey: string;
  currency: (typeof COST_CURRENCIES)[number];
  discountAmount: string;
  discountMode: "amount" | "none" | "percent";
  discountMonths: string;
  discountPercent: string;
  discountSpan: "months" | "until";
  discountUntil: string;
  kind: CostKind;
  name: string;
  percents: Record<string, string>;
  planLabel: string;
  projectIds: string[];
  split: CostSplit;
  startedOn: string;
  trialUntil: string;
};

export const costFormSchema = z
  .object({
    amount: z.string(),
    billing: z.enum(COST_BILLINGS),
    catalogKey: z.string().max(64),
    currency: z.enum(COST_CURRENCIES),
    discountAmount: z.string(),
    discountMode: z.enum(["amount", "none", "percent"]),
    discountMonths: z.string(),
    discountPercent: z.string(),
    discountSpan: z.enum(["months", "until"]),
    discountUntil: z.string(),
    kind: z.enum(COST_KINDS),
    name: z.string(),
    percents: z.record(z.string(), z.string()),
    planLabel: z.string(),
    projectIds: z.array(z.string()),
    split: z.enum(COST_SPLITS),
    startedOn: z.string(),
    trialUntil: z.string(),
  })
  .superRefine((value, context) => {
    const parsed = toCostItemInput(value as CostFormValues, value.projectIds[0] ?? "");
    if (typeof parsed === "string") issue(context, true, parsed, [formErrorPath(parsed)]);
  });

function formErrorPath(code: string) {
  if (code === "date") return "startedOn";
  if (code === "trial") return "trialUntil";
  if (code === "discount") return "discountAmount";
  if (code === "projects" || code === "percent") return "projectIds";
  return code;
}

function issue(context: z.RefinementCtx, failed: boolean, code: string, path: (number | string)[]) {
  if (failed) context.addIssue({ code: "custom", message: code, path });
}

function isDate(value: string) {
  try {
    monthKey(value);
    return true;
  } catch {
    return false;
  }
}

function refineDiscount(value: CostItemInput, context: z.RefinementCtx) {
  const discount = value.discount;
  if (!discount) return;
  const until = discount.until;
  const dated = Boolean(until) === (discount.months === null);
  const valueOk =
    discount.mode === "percent"
      ? discount.percent !== null
      : (discount.amountMinor ?? value.amountMinor) < value.amountMinor;
  issue(context, !dated || !valueOk || (until !== null && !isDate(until)), "discount", [
    "discount",
  ]);
}

function refineSplit(value: CostItemInput, context: z.RefinementCtx) {
  const ids = value.projects.map((project) => project.projectPublicId);
  const unique = new Set(ids).size === ids.length;
  const includesCurrent = ids.includes(value.projectId);
  issue(context, !unique || !includesCurrent, "projects", ["projects"]);
  if (value.split === "single_project") {
    issue(context, ids.length !== 1 || ids[0] !== value.projectId, "projects", ["projects"]);
  }
  if (value.split === "percent") {
    const invalid = value.projects.some((project) => {
      const points = project.basisPoints;
      return points === null || points < 0 || points > PERCENT_BASIS;
    });
    issue(context, invalid, "percent", ["projects"]);
  }
  if (value.split !== "percent") {
    issue(
      context,
      value.projects.some((project) => project.basisPoints !== null),
      "projects",
      ["projects"],
    );
  }
}

export function toCostItemInput(
  values: CostFormValues,
  projectPublicId: string,
  publicId?: string,
): CostItemInput | string {
  if (!values.name.trim()) return "name";
  if (!isDate(values.startedOn)) return "date";
  const amountMinor = majorToMinor(values.amount, values.currency);
  if (amountMinor === null) return "amount";
  const trialUntil = values.trialUntil.trim() || null;
  if (trialUntil && (!isDate(trialUntil) || trialUntil < values.startedOn)) return "trial";
  const discount = discountDraft(values, amountMinor);
  if (discount === "discount") return "discount";
  const projects = projectLinks(values, projectPublicId);
  if (typeof projects === "string") return projects;
  return {
    amountMinor,
    billing: values.billing,
    catalogKey: values.catalogKey.trim() || null,
    currency: values.currency,
    discount,
    kind: values.kind,
    name: values.name.trim(),
    planLabel: values.planLabel.trim(),
    projectId: projectPublicId,
    projects,
    ...(publicId ? { publicId } : {}),
    split: values.split,
    startedOn: values.startedOn,
    trialUntil,
  };
}

function discountDraft(
  values: CostFormValues,
  amountMinor: number,
): DiscountDraft | "discount" | null {
  if (values.discountMode === "none") return null;
  const until = values.discountSpan === "until" ? values.discountUntil.trim() : null;
  const months = values.discountSpan === "months" ? Number(values.discountMonths) : null;
  const spanOk = until
    ? isDate(until)
    : Number.isInteger(months) && (months ?? 0) >= 1 && (months ?? 0) <= 36;
  if (!spanOk) return "discount";
  if (values.discountMode === "percent") {
    const percent = Number(values.discountPercent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 99) return "discount";
    return { amountMinor: null, mode: "percent", months, percent, until };
  }
  const reduced = majorToMinor(values.discountAmount, values.currency);
  if (reduced === null || reduced >= amountMinor) return "discount";
  return { amountMinor: reduced, mode: "amount", months, percent: null, until };
}

function projectLinks(values: CostFormValues, projectPublicId: string) {
  const ids =
    values.split === "single_project" ? [projectPublicId] : [...new Set(values.projectIds)];
  if (!ids.includes(projectPublicId) || ids.length === 0) return "projects";
  if (values.split !== "percent") {
    return ids.map((projectPublicId) => ({ basisPoints: null, projectPublicId }));
  }
  if (ids.some((id) => !/^\d+(?:\.\d{1,2})?$/.test(values.percents[id] ?? ""))) return "percent";
  const links = ids.map((id) => ({
    basisPoints: Math.round(Number(values.percents[id]) * 100),
    projectPublicId: id,
  }));
  const percents = links.map((link) => link.basisPoints);
  if (percents.some((value) => !Number.isInteger(value) || value < 0 || value > PERCENT_BASIS))
    return "percent";
  return links.map((link) => ({
    basisPoints: link.basisPoints,
    projectPublicId: link.projectPublicId,
  }));
}

export function landingMinor(input: CostItemInput) {
  const total = regularMonthlyMinor(input.billing, input.amountMinor);
  const shares: CostProjectShare[] = input.projects.map((project) => ({
    basisPoints: project.basisPoints,
    projectId: project.projectPublicId,
  }));
  return (
    splitMinor(input.billing === "one_off" ? input.amountMinor : total, input.split, shares).find(
      (part) => part.projectId === input.projectId,
    )?.minor ?? 0
  );
}

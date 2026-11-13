"use client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import type { CostCatalogEntry, CostKind } from "@/lib/cost-items/catalog";
import type { CostFormValues } from "@/lib/cost-items/input";
import { COST_KINDS, landingMinor, toCostItemInput } from "@/lib/cost-items/input";
import { COST_CURRENCIES } from "@/lib/cost-items/money";
import { COST_BILLINGS } from "@/lib/cost-items/monthly";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useMinorMoney } from "./cost-money";
export function CostDrawerFields({
  catalog,
  form,
  projectPublicId,
  suggestHref,
}: Readonly<{
  catalog: readonly CostCatalogEntry[];
  form: UseFormReturn<CostFormValues>;
  projectPublicId: string;
  suggestHref: string | null;
}>) {
  const t = useTranslations("projectUsageCosts");
  const values = form.watch();
  const entry = catalog.find((item) => item.key === values.catalogKey);
  const errors = form.formState.errors;
  return (
    <div className="flex flex-col gap-4">
      <Field
        label={t("drawer.tool")}
        caption={
          suggestHref ? (
            <Link className="w-fit underline underline-offset-2" href={suggestHref}>
              {t("drawer.suggest")}
            </Link>
          ) : undefined
        }
      >
        <MenuSelect
          size="input"
          ariaLabel={t("drawer.tool")}
          onChange={(key) => chooseTool(form, catalog, key)}
          options={[
            { label: t("kinds.custom"), value: "" },
            ...catalog.map((item) => ({ label: item.name, value: item.key })),
          ]}
          searchable
          value={values.catalogKey}
        />
      </Field>
      {values.catalogKey ? null : (
        <Field label={t("drawer.name")} error={errors.name?.message}>
          <Input aria-label={t("drawer.name")} {...form.register("name")} />
        </Field>
      )}
      {values.catalogKey ? null : (
        <Field label={t("card.columns.type")}>
          <MenuSelect
            size="input"
            ariaLabel={t("card.columns.type")}
            onChange={(kind) => form.setValue("kind", kind as CostKind)}
            options={COST_KINDS.map((kind) => ({ label: t(`kinds.${kind}`), value: kind }))}
            value={values.kind}
          />
        </Field>
      )}
      <Field error={errors.planLabel?.message} hint={t("drawer.planHint")} label={t("drawer.plan")}>
        <Input aria-label={t("drawer.plan")} {...form.register("planLabel")} />
        {entry?.plans.length ? (
          <div className="flex flex-wrap gap-2">
            {entry.plans.map((plan) => (
              <Button
                key={plan}
                onClick={() => form.setValue("planLabel", plan)}
                size="input"
                type="button"
                variant="outline"
              >
                {plan}
              </Button>
            ))}
          </div>
        ) : null}
      </Field>
      <Field label={t("drawer.billing")} hint={t("lifetimeHint")}>
        <SegmentedControl
          ariaLabel={t("drawer.billing")}
          onChange={(billing) => form.setValue("billing", billing)}
          options={COST_BILLINGS.map((billing) => ({
            label: t(`billing.${billing}`),
            value: billing,
          }))}
          size="field"
          value={values.billing}
        />
      </Field>
      <Field error={errors.amount?.message} label={t("drawer.amount")}>
        <div className="flex gap-2">
          <Input aria-label={t("drawer.amount")} inputMode="decimal" {...form.register("amount")} />
          <div className="w-24 shrink-0">
            <MenuSelect
              size="input"
              ariaLabel={t("drawer.currency")}
              onChange={(currency) =>
                form.setValue("currency", currency as CostFormValues["currency"])
              }
              options={COST_CURRENCIES.map((currency) => ({ label: currency, value: currency }))}
              value={values.currency}
            />
          </div>
        </div>
      </Field>
      <Field error={errors.trialUntil?.message} label={t("drawer.priceChanges")}>
        <span className="text-sm text-fg-muted">{t("drawer.trialUntil")}</span>
        <Input aria-label={t("drawer.trialUntil")} type="date" {...form.register("trialUntil")} />
        <SegmentedControl
          ariaLabel={t("drawer.discount")}
          onChange={(mode) => form.setValue("discountMode", mode)}
          options={[
            { label: t("drawer.none"), value: "none" },
            { label: t("drawer.percent"), value: "percent" },
            { label: t("drawer.money"), value: "amount" },
          ]}
          size="field"
          value={values.discountMode}
        />
        {values.discountMode === "none" ? null : (
          <DiscountFields error={errors.discountAmount?.message} form={form} values={values} />
        )}
      </Field>
      <Field error={errors.startedOn?.message} label={t("drawer.started")}>
        <Input aria-label={t("drawer.started")} type="date" {...form.register("startedOn")} />
      </Field>
      <ProjectShareField form={form} projectPublicId={projectPublicId} values={values} />
    </div>
  );
}
function ProjectShareField({
  form,
  projectPublicId,
  values,
}: Readonly<{
  form: UseFormReturn<CostFormValues>;
  projectPublicId: string;
  values: CostFormValues;
}>) {
  const t = useTranslations("projectUsageCosts");
  const money = useMinorMoney();
  const partial = values.split !== "single_project";
  const percent = sharePercentDraft(values, projectPublicId);
  const input = partial ? toCostItemInput(values, projectPublicId) : null;
  const share = input === null || typeof input === "string" ? null : landingMinor(input);
  return (
    <div className="flex flex-col gap-2">
      <Switch
        checked={partial}
        className="h-10 w-fit max-sm:h-11 border-0 bg-transparent p-0"
        label={t("drawer.partial")}
        onChange={(event) => setPartial(form, projectPublicId, values, event.currentTarget.checked)}
      />
      <p className="text-ui-caption text-fg-muted">{t("drawer.partialHint")}</p>
      {partial ? (
        <Field error={form.formState.errors.projectIds?.message} label={t("card.columns.project")}>
          <Input
            aria-label={t("card.columns.project")}
            inputMode="numeric"
            onBlur={() => clampSharePercent(form, projectPublicId)}
            onChange={(event) => {
              form.setValue("split", "percent");
              form.setValue("projectIds", [projectPublicId]);
              form.setValue("percents", {
                ...values.percents,
                [projectPublicId]: event.target.value,
              });
            }}
            value={
              values.split === "percent" ? (values.percents[projectPublicId] ?? percent) : percent
            }
          />
          {share !== null && input && typeof input !== "string" ? (
            <p className="text-ui-caption text-fg-muted" data-testid="cost-lands">
              {input.billing === "one_off"
                ? t("drawer.landsOnce", { amount: money(input.currency, share) })
                : t("drawer.lands", { amount: money(input.currency, share) })}
            </p>
          ) : null}
        </Field>
      ) : null}
    </div>
  );
}
function sharePercentDraft(values: CostFormValues, projectPublicId: string) {
  if (values.split === "percent") return values.percents[projectPublicId] || "50";
  if (values.split === "equal") {
    return String(Math.round(10_000 / Math.max(values.projectIds.length, 1)) / 100);
  }
  return "50";
}
function setPartial(
  form: UseFormReturn<CostFormValues>,
  projectPublicId: string,
  values: CostFormValues,
  on: boolean,
) {
  const current = sharePercentDraft(values, projectPublicId);
  form.setValue("split", on ? "percent" : "single_project");
  form.setValue("projectIds", [projectPublicId]);
  form.setValue("percents", {
    ...values.percents,
    [projectPublicId]: on ? (current === "100" ? "50" : current) : "100",
  });
}
function clampSharePercent(form: UseFormReturn<CostFormValues>, projectPublicId: string) {
  if (form.getValues("split") !== "percent") return;
  const parsed = Number(form.getValues("percents")[projectPublicId]);
  const next = Number.isFinite(parsed)
    ? String(Math.min(100, Math.max(0, Math.round(parsed * 100) / 100)))
    : "50";
  form.setValue("percents", { ...form.getValues("percents"), [projectPublicId]: next });
}
function chooseTool(
  form: UseFormReturn<CostFormValues>,
  catalog: readonly CostCatalogEntry[],
  key: string,
) {
  const entry = catalog.find((item) => item.key === key);
  form.setValue("catalogKey", key);
  form.setValue("name", entry?.name ?? "");
  form.setValue("kind", entry?.kind ?? "custom");
}
function DiscountFields({
  error,
  form,
  values,
}: Readonly<{ error?: string; form: UseFormReturn<CostFormValues>; values: CostFormValues }>) {
  const t = useTranslations("projectUsageCosts.drawer");
  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-invalid={Boolean(error)}
        aria-label={values.discountMode === "percent" ? t("percent") : t("money")}
        inputMode="decimal"
        {...form.register(values.discountMode === "percent" ? "discountPercent" : "discountAmount")}
      />
      <SegmentedControl
        ariaLabel={t("discount")}
        onChange={(span) => form.setValue("discountSpan", span)}
        options={[
          { label: t("forMonths"), value: "months" },
          { label: t("untilDate"), value: "until" },
        ]}
        size="field"
        value={values.discountSpan}
      />
      {values.discountSpan === "months" ? (
        <Input aria-label={t("months")} inputMode="numeric" {...form.register("discountMonths")} />
      ) : (
        <Input aria-label={t("untilDate")} type="date" {...form.register("discountUntil")} />
      )}
      <ErrorText code={error} />
    </div>
  );
}
function Field({
  children,
  caption,
  error,
  hint,
  label,
}: Readonly<{
  children: ReactNode;
  caption?: ReactNode;
  error?: string;
  hint?: string;
  label: string;
}>) {
  return (
    <FormField help={hint} label={label} caption={caption}>
      {children}
      <ErrorText code={error} />
    </FormField>
  );
}
function ErrorText({ code }: Readonly<{ code?: string }>) {
  const t = useTranslations("projectUsageCosts.drawer.errors");
  if (!code || code === "root") return null;
  return <p className="text-sm text-danger">{t(code as "amount")}</p>;
}

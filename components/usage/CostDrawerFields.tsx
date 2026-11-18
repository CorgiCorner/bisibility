"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import type { CostCatalogEntry, CostKind } from "@/lib/cost-items/catalog";
import type { CostFormValues } from "@/lib/cost-items/input";
import { COST_KINDS, landingMinor, toCostItemInput } from "@/lib/cost-items/input";
import { COST_CURRENCIES } from "@/lib/cost-items/money";
import { COST_BILLINGS } from "@/lib/cost-items/monthly";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { Field } from "./CostFormField";
import { CostPriceChanges } from "./CostPriceChanges";
import { useMinorMoney } from "./cost-money";
export function CostDrawerFields({
  catalog,
  form,
  projectPublicId,
}: Readonly<{
  catalog: readonly CostCatalogEntry[];
  form: UseFormReturn<CostFormValues>;
  projectPublicId: string;
}>) {
  const t = useTranslations("projectUsageCosts");
  const values = form.watch();
  const entry = catalog.find((item) => item.key === values.catalogKey);
  const errors = form.formState.errors;
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("drawer.tool")}>
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
        <Field label={t("drawer.name")} hint={t("drawer.nameHint")} error={errors.name?.message}>
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
      {!values.catalogKey && values.kind === "custom" ? (
        <Field
          label={t("drawer.customType")}
          hint={t("drawer.customTypeHint")}
          error={errors.customType?.message}
        >
          <Input
            aria-label={t("drawer.customType")}
            maxLength={80}
            {...form.register("customType")}
          />
        </Field>
      ) : null}
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
      <CostPriceChanges form={form} />
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
      {partial ? (
        <Field
          error={form.formState.errors.projectIds?.message}
          label={t("card.columns.project")}
          caption={
            <div className="grid gap-2">
              <span>{t("drawer.partialHint")}</span>
              {share !== null && input && typeof input !== "string" ? (
                <p className="text-ui-caption text-fg-muted" data-testid="cost-lands">
                  {input.billing === "one_off"
                    ? t("drawer.landsOnce", { amount: money(input.currency, share) })
                    : t("drawer.lands", { amount: money(input.currency, share) })}
                </p>
              ) : null}
            </div>
          }
        >
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

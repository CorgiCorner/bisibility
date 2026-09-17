"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Sheet } from "@/components/ui/Sheet";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import {
  type ProjectMarketEditInput,
  projectMarketEditSchemaFor,
} from "@/lib/markets/project-market-edit";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

type MarketEditSheetProps = {
  canEdit: boolean;
  market: MarketsPageRow | null;
  onClose: () => void;
  onSave: (input: ProjectMarketEditInput) => Promise<void>;
  projectId: string;
};

function selectedDevice(devices: readonly string[]) {
  if (devices.length === 2) return "both";
  return devices[0] ?? "both";
}

export function MarketEditSheet({
  canEdit,
  market,
  onClose,
  onSave,
  projectId,
}: Readonly<MarketEditSheetProps>) {
  const t = useTranslations("projectMarkets");
  const [error, setError] = useState<string | null>(null);
  const values = {
    futureKeywordDevices: market?.futureKeywordDevices ?? ["desktop", "mobile"],
    marketId: market?.id ?? "",
    name: market?.name ?? "",
    projectId,
  } satisfies ProjectMarketEditInput;
  const form = useForm<ProjectMarketEditInput>({
    resolver: zodResolver(
      projectMarketEditSchemaFor({
        nameRequired: t("marketNameRequired"),
        nameTooLong: t("marketNameTooLong"),
      }),
    ),
    values,
  });
  const futureKeywordDevices = form.watch("futureKeywordDevices");

  async function submit(input: ProjectMarketEditInput) {
    if (!canEdit) return;
    setError(null);
    try {
      await onSave(input);
      onClose();
    } catch (cause) {
      setError(actionErrorMessage(cause, t("updateMarketFailed")));
    }
  }

  return (
    <Sheet
      footer={
        <div className="flex justify-end gap-2">
          <Button
            disabled={form.formState.isSubmitting}
            onClick={onClose}
            size="sm"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
          <Button
            form="market-edit-form"
            loading={form.formState.isSubmitting}
            size="sm"
            type="submit"
          >
            {t("save")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={market !== null}
      title={t("editTitle", { market: market?.name ?? t("market") })}
    >
      <form className="grid gap-5" id="market-edit-form" onSubmit={form.handleSubmit(submit)}>
        <input type="hidden" {...form.register("projectId")} />
        <input type="hidden" {...form.register("marketId")} />
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-fg">{t("marketName")}</span>
          <input
            aria-invalid={Boolean(form.formState.errors.name)}
            className="h-10 rounded-control border border-border-control bg-bg-elev px-3 text-[13px] text-fg outline-none focus:border-accent disabled:bg-bg-sunken"
            disabled={!canEdit}
            {...form.register("name")}
          />
          {form.formState.errors.name ? (
            <span className="text-[12px] text-red-text">{form.formState.errors.name.message}</span>
          ) : null}
        </label>
        <div className="grid gap-1.5">
          <span className="text-[12px] font-medium text-fg">{t("defaultsForFutureKeywords")}</span>
          <MenuSelect
            ariaLabel={t("defaultDevices")}
            disabled={!canEdit}
            onChange={(value) =>
              form.setValue(
                "futureKeywordDevices",
                value === "both" ? ["desktop", "mobile"] : [value as "desktop" | "mobile"],
                {
                  shouldDirty: true,
                  shouldValidate: true,
                },
              )
            }
            options={[
              { label: t("desktop"), value: "desktop" },
              { label: t("mobile"), value: "mobile" },
              { label: t("both"), value: "both" },
            ]}
            size="input"
            value={selectedDevice(futureKeywordDevices)}
          />
          <span className="text-[12px] leading-[1.45] text-fg-muted">
            {t("futureKeywordsHint")}
          </span>
        </div>
        <div className="rounded-control border border-border bg-bg-sunken px-3 py-3">
          <p className="m-0 text-[12px] font-medium text-fg">{t("locationAndLanguage")}</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.45] text-fg-muted">
            {market
              ? t("locationAndLanguageFixed", {
                  market: `${market.displayName} / ${market.languageLabel}`,
                })
              : null}
          </p>
        </div>
        {error ? <p className="m-0 text-[12px] text-red-text">{error}</p> : null}
      </form>
    </Sheet>
  );
}

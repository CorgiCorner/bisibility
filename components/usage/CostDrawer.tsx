"use client";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { CostCatalogEntry } from "@/lib/cost-items/catalog";
import {
  type CostFormValues,
  type CostItemInput,
  costFormSchema,
  toCostItemInput,
} from "@/lib/cost-items/input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { CostDrawerFields } from "./CostDrawerFields";
import { CostLiveSummary } from "./CostLiveSummary";

export function CostDrawer({
  catalog,
  editingId,
  initial,
  mode,
  onClose,
  onSubmit,
  open,
  projectPublicId,
  suggestHref,
}: Readonly<{
  catalog: readonly CostCatalogEntry[];
  editingId?: string;
  initial: CostFormValues;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (input: CostItemInput) => Promise<void>;
  open: boolean;
  projectPublicId: string;
  suggestHref: string | null;
}>) {
  const t = useTranslations("projectUsageCosts.drawer");
  const formId = useId();
  const [failed, setFailed] = useState(false);
  const form = useForm<CostFormValues>({
    defaultValues: initial,
    resolver: zodResolver(costFormSchema),
  });
  const submit = form.handleSubmit(async (values) => {
    const input = toCostItemInput(values, projectPublicId, editingId);
    if (typeof input === "string") return;
    setFailed(false);
    try {
      await onSubmit(input);
      onClose();
    } catch {
      setFailed(true);
    }
  });
  return (
    <Sheet
      footer={
        <div className="flex justify-end gap-2">
          <Button size="input" onClick={onClose} type="button" variant="outline">
            {t("cancel")}
          </Button>
          <Button
            size="input"
            form={formId}
            loading={form.formState.isSubmitting}
            type="submit"
            variant="primary"
          >
            {mode === "create" ? t("submit") : t("save")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title={mode === "create" ? t("addTitle") : t("editTitle")}
      widthVariant="form"
    >
      <form className="flex flex-col gap-4" id={formId} onSubmit={submit}>
        <CostDrawerFields
          catalog={catalog}
          form={form}
          projectPublicId={projectPublicId}
          suggestHref={suggestHref}
        />
        <CostLiveSummary projectPublicId={projectPublicId} values={form.watch()} />
        {failed ? <p className="text-sm text-danger">{t("saveError")}</p> : null}
      </form>
    </Sheet>
  );
}

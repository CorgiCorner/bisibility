"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Sheet } from "@/components/ui/Sheet";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import {
  type ProjectMarketEditInput,
  projectMarketEditSchema,
} from "@/lib/markets/project-market-edit";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useState } from "react";
import { useForm } from "react-hook-form";

type MarketEditSheetProps = {
  canEdit: boolean;
  market: MarketsPageRow | null;
  onClose: () => void;
  onSave: (input: ProjectMarketEditInput) => Promise<void>;
  projectId: string;
};

const deviceOptions = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
  { label: "Both", value: "both" },
];

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
  const [error, setError] = useState<string | null>(null);
  const values = {
    futureKeywordDevices: market?.futureKeywordDevices ?? ["desktop", "mobile"],
    marketId: market?.id ?? "",
    name: market?.name ?? "",
    projectId,
  } satisfies ProjectMarketEditInput;
  const form = useForm<ProjectMarketEditInput>({
    resolver: zodResolver(projectMarketEditSchema),
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
      setError(actionErrorMessage(cause, "Market could not be updated."));
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
            Cancel
          </Button>
          <Button
            form="market-edit-form"
            loading={form.formState.isSubmitting}
            size="sm"
            type="submit"
          >
            Save changes
          </Button>
        </div>
      }
      onClose={onClose}
      open={market !== null}
      title={market ? `Edit ${market.name}` : "Edit market"}
    >
      <form className="grid gap-5" id="market-edit-form" onSubmit={form.handleSubmit(submit)}>
        <input type="hidden" {...form.register("projectId")} />
        <input type="hidden" {...form.register("marketId")} />
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-fg">Market name</span>
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
          <span className="text-[12px] font-medium text-fg">Defaults for future keywords</span>
          <MenuSelect
            ariaLabel="Default devices for future keywords"
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
            options={deviceOptions}
            size="input"
            value={selectedDevice(futureKeywordDevices)}
          />
          <span className="text-[12px] leading-[1.45] text-fg-muted">
            These defaults apply only to future keywords.
          </span>
        </div>
        <div className="rounded-control border border-border bg-bg-sunken px-3 py-3">
          <p className="m-0 text-[12px] font-medium text-fg">Location and language</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.45] text-fg-muted">
            {market ? `${market.displayName} / ${market.languageLabel}` : ""} cannot be changed
            after creation.
          </p>
        </div>
        {error ? <p className="m-0 text-[12px] text-red-text">{error}</p> : null}
      </form>
    </Sheet>
  );
}

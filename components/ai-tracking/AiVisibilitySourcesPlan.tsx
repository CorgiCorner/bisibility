"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusChip } from "@/components/ui/StatusChip";
import type { AiSourcePlanRow, AiSourcePlanState } from "@/lib/ai-tracking/sources-model";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { useTranslations } from "next-intl";
import { sourceTypeLabel } from "./source-copy";

export function AiVisibilitySourcesPlan({
  canWrite,
  onRemove,
  onUpdate,
  pending,
  plan,
}: Readonly<{
  canWrite: boolean;
  onRemove: (domain: string) => void;
  onUpdate: (domain: string, patch: { note?: string | null; state?: AiSourcePlanState }) => void;
  pending: boolean;
  plan: readonly AiSourcePlanRow[];
}>) {
  const t = useTranslations("projectAiTracking");
  const disabled = !canWrite || pending;
  return (
    <Card className="flex flex-col gap-3" size="sm">
      <h2 className="m-0 font-sans text-ui-section">{t("sources.planTitle")}</h2>
      {plan.length === 0 ? (
        <p className="m-0 text-ui-caption text-fg-muted">{t("sources.planEmpty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {plan.map((item) => (
            <li
              className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
              key={item.domain}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-ui-body font-semibold">{item.domain}</p>
                  <p className="m-0 text-ui-caption text-fg-muted">
                    {sourceTypeLabel(item.type, t)}
                  </p>
                </div>
                <IconButton
                  aria-label={t("sources.planRemove", { domain: item.domain })}
                  disabled={disabled}
                  onClick={() => onRemove(item.domain)}
                  size="small"
                  type="button"
                >
                  <TrashIcon aria-hidden size={16} weight="regular" />
                </IconButton>
              </div>
              {item.state === "dismissed" ? (
                <div className="flex items-center gap-2">
                  <StatusChip label={t("sources.planDismissed")} size="sm" tone="neutral" />
                  <Button
                    className="whitespace-nowrap"
                    disabled={disabled}
                    onClick={() => onUpdate(item.domain, { state: "todo" })}
                    size="input"
                    type="button"
                    variant="secondary"
                  >
                    {t("sources.planTodo")}
                  </Button>
                </div>
              ) : (
                <SegmentedControl
                  ariaLabel={t("sources.planState", { domain: item.domain })}
                  disabled={disabled}
                  onChange={(state) => onUpdate(item.domain, { state })}
                  options={[
                    { label: t("sources.planTodo"), value: "todo" },
                    { label: t("sources.planDone"), value: "done" },
                  ]}
                  size="field"
                  value={item.state}
                />
              )}
              <Input
                aria-label={t("sources.planNote", { domain: item.domain })}
                defaultValue={item.note ?? ""}
                disabled={disabled}
                key={`${item.domain}:${item.note ?? ""}`}
                onBlur={(event) => {
                  const note = event.target.value.trim();
                  if (note === (item.note ?? "")) return;
                  onUpdate(item.domain, { note: note || null });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

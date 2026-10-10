"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { AiCatalogOutcome, AiModelCapability } from "@/lib/ai-research/catalog-types";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
export function TrackingModelControl({
  value,
  onChange,
  onCatalog,
}: Readonly<{
  value: string;
  onChange: (model: string) => void;
  onCatalog?: () => Promise<AiCatalogOutcome>;
}>) {
  const t = useTranslations("projectAiTracking");
  const [models, setModels] = useState<AiModelCapability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <p>{t("model")}</p>
      {models.length ? (
        <MenuSelect
          ariaLabel={t("model")}
          size="input"
          value={value}
          onChange={onChange}
          options={models.map((model) => ({
            value: model.id,
            label: model.label,
            disabled: !model.priceAvailable || !model.actualCostEnabled,
          }))}
        />
      ) : (
        <Input
          aria-label={t("model")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("exactProviderModelIdentifier")}
        />
      )}
      {onCatalog && (
        <Button
          size="xs"
          variant="ghost"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                setError(null);
                const outcome = await onCatalog();
                if (outcome.ok) setModels(outcome.catalog.models);
                else setError(outcome.message);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t("capabilitiesUnavailable"));
              }
            })
          }
        >
          {t("loadSupportedModels")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-text">
          {error}
        </p>
      )}
      <p className="text-xs leading-5 text-fg-muted">{t("modelCapabilitiesHint")}</p>
    </div>
  );
}

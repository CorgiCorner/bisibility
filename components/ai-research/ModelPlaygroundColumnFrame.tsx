"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ResultColumn } from "@/lib/model-playground/result-view";
import { MODEL_PROVIDER_CATALOG } from "@/lib/providers/model/catalog-metadata";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Identity = Pick<ResultColumn, "id" | "label" | "modelId" | "providerLabel"> &
  Partial<
    Pick<
      ResultColumn,
      "providerId" | "fundingSource" | "legacyFunding" | "workspaceMismatch" | "routingViolation"
    >
  >;
export function ModelPlaygroundColumnFrame({
  column,
  onRemove,
  onSettings,
  disabled,
  children,
}: Readonly<{
  column: Identity;
  onRemove: (id: string) => void;
  onSettings?: (id: string) => void;
  disabled?: boolean;
  children: ReactNode;
}>) {
  const t = useTranslations("projectAiResearch");
  const c = useTranslations("projectAiResearch.modelPlayground");
  const provider = MODEL_PROVIDER_CATALOG.find(
    (item) => item.id === column.providerId || item.label === column.providerLabel,
  );
  return (
    <Card
      aria-label={`${column.label} · ${column.providerLabel ?? column.id}`}
      className="model-playground-column gap-3"
      component="article"
      data-column-id={column.id}
    >
      <header className="grid min-w-0 gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {provider ? (
              <ProviderLogo
                alt={provider.label}
                domain={provider.logoDomain}
                size="xs"
                appearance="bare"
                theme="auto"
                fallbackIcon="globe"
                tint="var(--fg-muted)"
              />
            ) : null}
            <div className="min-w-0">
              <h2 className="model-playground-model-label m-0 text-ui-body font-medium">
                {column.label}
              </h2>
              {column.label !== column.modelId ? (
                <p className="m-0 break-all text-ui-caption text-fg-muted" data-model-id>
                  {column.modelId}
                </p>
              ) : null}
              {column.providerLabel ? (
                <span className="text-ui-caption text-fg-muted">
                  {column.providerLabel} ·{" "}
                  {t(
                    column.fundingSource === "platform" || column.legacyFunding === "platform"
                      ? "modelPlayground.credits"
                      : "modelPlayground.yourKey",
                  )}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {column.legacyFunding ? (
              <Tooltip content={t("modelPlayground.sharedPayment")}>
                <span>
                  <StatusChip
                    dot={false}
                    label={t(
                      column.legacyFunding === "byok"
                        ? "modelPlayground.yourKey"
                        : "modelPlayground.credits",
                    )}
                    tone={column.legacyFunding === "byok" ? "info" : "positive"}
                  />
                </span>
              </Tooltip>
            ) : null}
            {onSettings ? (
              <Button
                className="min-w-0"
                aria-label={`${c("settings")}: ${column.label}`}
                disabled={disabled}
                onClick={() => onSettings(column.id)}
                size="sm"
                variant="outline"
              >
                <SlidersHorizontalIcon aria-hidden size={16} weight="regular" />
              </Button>
            ) : null}
            <Button
              className="min-w-0"
              aria-label={`${t("modelPlayground.remove")}: ${column.label}`}
              disabled={disabled}
              onClick={() => onRemove(column.id)}
              size="sm"
              variant="outline"
            >
              <XIcon aria-hidden size={16} weight="regular" />
            </Button>
          </div>
        </div>
        {column.workspaceMismatch || column.routingViolation ? (
          <div className="grid min-w-0 gap-1">
            {column.workspaceMismatch ? (
              <InlineCallout role="status" tint="yellow">
                {t("modelPlayground.workspaceMismatch")}
              </InlineCallout>
            ) : null}
            {column.routingViolation ? (
              <InlineCallout role="status" tint="yellow">
                {t("modelPlayground.routingViolation")}
              </InlineCallout>
            ) : null}
          </div>
        ) : null}
      </header>
      {children}
    </Card>
  );
}

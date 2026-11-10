"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ComparisonProvider } from "@/lib/provider-comparison/types";
import { appPath } from "@/lib/routing/app-path";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { useTranslations } from "next-intl";
import { providerLabels } from "./provider-labels";
export function AddPlaygroundProvider({
  provider,
  ready,
  selected,
  onAdd,
  projectRef,
}: {
  provider: ComparisonProvider;
  ready: boolean;
  selected: boolean;
  onAdd: () => void;
  projectRef: string;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  return (
    <Card className="flex min-h-[280px] flex-col items-center justify-center gap-4 border-dashed p-6 text-center">
      <PlusIcon weight="regular" size={28} aria-hidden className="text-fg-muted" />
      <div className="space-y-2">
        <h2 className="m-0 text-ui-section">{t("compareProviderTitle")}</h2>
        <p className="m-0 max-w-xs text-sm text-fg-muted">{t("compareProviderHelp")}</p>
      </div>
      {ready ? (
        <Button variant="outline" onClick={onAdd} disabled={selected}>
          {t(selected ? "providerAdded" : "addProvider", { provider: providerLabels[provider] })}
        </Button>
      ) : (
        <Button asChild variant="outline">
          <a href={appPath(projectRef, "providers")}>
            {t("connectProvider", { provider: providerLabels[provider] })}
          </a>
        </Button>
      )}
    </Card>
  );
}

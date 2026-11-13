"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatCount, formatDay } from "@/lib/conversions/format";
import type {
  ConversionActionResult,
  ConversionSource,
  ConversionSourceState,
} from "@/lib/conversions/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type SetPrimary = (input: {
  projectId: string;
  source: ConversionSource;
}) => Promise<ConversionActionResult>;

type SyncSource = (input: {
  projectId: string;
  source: ConversionSource;
}) => Promise<ConversionActionResult>;

export function ConversionSourcesCard({
  canEdit,
  connectHref,
  projectId,
  setPrimary,
  sources,
  syncSource,
}: Readonly<{
  canEdit: boolean;
  connectHref: string;
  projectId: string;
  setPrimary: SetPrimary;
  sources: ConversionSourceState[];
  syncSource: SyncSource;
}>) {
  const t = useTranslations("projectSettingsConversions");
  const locale = useLocale();
  const router = useRouter();
  const [pendingSource, setPendingSource] = useState<ConversionSourceState | null>(null);
  const [pending, setPending] = useState(false);
  const [syncing, setSyncing] = useState<ConversionSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync(source: ConversionSource) {
    setSyncing(source);
    setError(null);
    try {
      const result = await syncSource({ projectId, source });
      if (!result.ok) {
        setError(t("sources.syncError"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("sources.syncError"));
    } finally {
      setSyncing(null);
    }
  }

  async function confirm() {
    if (!pendingSource) return;
    setPending(true);
    setError(null);
    try {
      const result = await setPrimary({ projectId, source: pendingSource.source });
      if (!result.ok) {
        setError(t("sources.error"));
        return;
      }
      setPendingSource(null);
      router.refresh();
    } catch {
      setError(t("sources.error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      description={t("sources.description")}
      showSave={false}
      title={t("sources.title")}
    >
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {sources.map((source) => (
          <li
            className="flex items-center gap-3 rounded-control bg-bg-sunken px-3 py-3"
            data-conversion-source={source.source}
            key={source.source}
          >
            <div className="min-w-0 flex-1">
              <p className="m-0 text-ui-body font-semibold text-fg">{source.label}</p>
              <p className="m-0 text-ui-caption text-fg-muted">
                {source.lastDay
                  ? t("sources.lastDay", { date: formatDay(source.lastDay, locale) })
                  : t("sources.noData")}
              </p>
              <p className="m-0 text-ui-caption text-fg-muted">
                {t("sources.last28", { count: formatCount(source.conversions28, locale) })}
              </p>
              {source.source === "ga4" ? (
                <p className="m-0 text-ui-caption text-fg-muted">{t("sources.ga4Together")}</p>
              ) : null}
              {source.source === "plausible" ? (
                <p className="m-0 text-ui-caption text-fg-muted">{t("sources.plausibleOrganic")}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusChip
                label={source.connected ? t("sources.connected") : t("sources.notConnected")}
                tone={source.connected ? "positive" : "neutral"}
              />
              {source.connected ? (
                <>
                  <Button
                    disabled={!canEdit || syncing !== null}
                    onClick={() => void sync(source.source)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {syncing === source.source ? t("sources.syncing") : t("sources.syncNow")}
                  </Button>
                  <Button
                    aria-checked={source.primary}
                    aria-label={t("sources.primaryFor", { source: source.label })}
                    disabled={!canEdit || pending || source.primary}
                    onClick={() => setPendingSource(source)}
                    role="radio"
                    size="sm"
                    type="button"
                    variant={source.primary ? "primary" : "outline"}
                  >
                    {t("sources.primary")}
                  </Button>
                </>
              ) : (
                <Button component={Link} href={connectHref} size="sm" variant="secondary">
                  {t("sources.connect")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="m-0 mt-3 text-sm text-fg-muted">{error}</p> : null}
      <Modal
        onClose={() => setPendingSource(null)}
        onPrimaryAction={() => void confirm()}
        open={pendingSource !== null}
        primaryActionDisabled={pending}
        size="sm"
        title={t("sources.confirmTitle")}
      >
        <p className="m-0 text-sm text-fg">
          {t("sources.confirmBody", { source: pendingSource?.label ?? "" })}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            disabled={pending}
            onClick={() => setPendingSource(null)}
            type="button"
            variant="secondary"
          >
            {t("sources.cancel")}
          </Button>
          <Button disabled={pending} onClick={() => void confirm()} type="button">
            {t("sources.confirmAction")}
          </Button>
        </div>
      </Modal>
    </SettingsCard>
  );
}

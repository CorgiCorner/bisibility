"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { CHALLENGE_TILE_IDS } from "@/lib/challenge-report/tile-state";
import type { ReportShareSummary } from "@/lib/report-sharing/model";
import type { ShareExpiryChoice, ShareSettings } from "@/lib/report-sharing/settings";
import { useTranslations } from "next-intl";

type Days = 7 | 30 | 90 | null;

const settingRow =
  "flex w-full flex-row-reverse items-center justify-between gap-4 rounded-none border-0 border-b border-border bg-transparent px-0 py-3 text-ui-body font-normal text-fg last:border-b-0";

function choiceToDays(choice: ShareExpiryChoice): Days {
  if (choice === "never") return null;
  return Number(choice) as Days;
}

export function ReportShareSettings({
  busy,
  canEdit,
  editingTiles,
  onExpiry,
  onSettings,
  onToggleTiles,
  summary,
}: Readonly<{
  busy: boolean;
  canEdit: boolean;
  editingTiles: boolean;
  onExpiry: (days: Days) => void;
  onSettings: (patch: Partial<ShareSettings>) => void;
  onToggleTiles: () => void;
  summary: ReportShareSummary;
}>) {
  const t = useTranslations("challengeReport.share");
  const tiles = useTranslations("challengeReport.tiles");
  return (
    <section className="grid">
      <h2 className="m-0 text-ui-section">{t("linkSettings")}</h2>
      <Switch
        checked={summary.settings.noindex}
        className={settingRow}
        description={t("noindexHelp")}
        disabled={!canEdit || busy}
        label={t("noindex")}
        onChange={(event) => onSettings({ noindex: event.currentTarget.checked })}
      />
      <div className="flex items-center justify-between gap-4 border-b border-border py-3">
        <p className="m-0 text-ui-body">{t("values")}</p>
        <Button
          disabled={!canEdit}
          onClick={onToggleTiles}
          size="input"
          type="button"
          variant="secondary"
        >
          {editingTiles
            ? t("valuesDone")
            : t("valuesEdit", { count: summary.settings.visibleTiles.length })}
        </Button>
      </div>
      {editingTiles ? (
        <div className="grid gap-2 border-b border-border py-3">
          {CHALLENGE_TILE_IDS.map((id) => (
            <Checkbox
              checked={summary.settings.visibleTiles.includes(id)}
              disabled={!canEdit || busy}
              key={id}
              label={tiles(id)}
              onChange={(event) => {
                const visible = summary.settings.visibleTiles;
                const next = event.currentTarget.checked
                  ? [...visible, id]
                  : visible.filter((tile) => tile !== id);
                onSettings({ visibleTiles: next });
              }}
            />
          ))}
        </div>
      ) : null}
      <Switch
        checked={summary.settings.roundNumbers}
        className={settingRow}
        description={t("roundHelp")}
        disabled={!canEdit || busy}
        label={t("round")}
        onChange={(event) => onSettings({ roundNumbers: event.currentTarget.checked })}
      />
      <Switch
        checked={summary.settings.showBadge}
        className={settingRow}
        disabled={!canEdit || busy}
        label={t("badge")}
        onChange={(event) => onSettings({ showBadge: event.currentTarget.checked })}
      />
      <Switch
        checked={summary.settings.showLessons}
        className={settingRow}
        disabled={!canEdit || busy}
        label={t("lessons")}
        onChange={(event) => onSettings({ showLessons: event.currentTarget.checked })}
      />
      <div className="grid gap-2 py-3">
        <p className="m-0 text-ui-body">{t("expires")}</p>
        <SegmentedControl
          ariaLabel={t("expires")}
          fitContent
          onChange={(value) => onExpiry(choiceToDays(value))}
          options={[
            { label: t("expiresNever"), value: "never" },
            { label: t("expires7"), value: "7" },
            { label: t("expires30"), value: "30" },
            { label: t("expires90"), value: "90" },
          ]}
          size="field"
          value={summary.expires}
        />
      </div>
    </section>
  );
}

export function ReportSharePublish({
  busy,
  mode,
  onMode,
  onPublish,
  summary,
}: Readonly<{
  busy: boolean;
  mode: "link" | "new";
  onMode: (mode: "link" | "new") => void;
  onPublish: () => void;
  summary: ReportShareSummary;
}>) {
  const t = useTranslations("challengeReport.share");
  if (!summary.pending) return null;
  return (
    <section className="grid gap-2">
      <h2 className="m-0 text-ui-section">{t("publishTitle")}</h2>
      <p className="m-0 text-ui-caption text-fg-muted">
        {t("publishReady", { title: summary.pending.title })}
      </p>
      <SegmentedControl
        ariaLabel={t("publishTitle")}
        onChange={onMode}
        options={[
          { label: t("publishUpdate"), value: "link" },
          { label: t("publishNew"), value: "new" },
        ]}
        size="field"
        value={mode}
      />
      <p className="m-0 text-ui-caption text-fg-muted">
        {mode === "link" ? t("publishUpdateHelp") : t("publishNewHelp")}
      </p>
      <Button
        className="justify-self-start"
        disabled={busy}
        onClick={onPublish}
        size="input"
        type="button"
      >
        {t("publishButton")}
      </Button>
    </section>
  );
}

export function ReportShareAccess({
  busy,
  canEdit,
  hasToken,
  onRevoke,
  owner,
  summary,
}: Readonly<{
  busy: boolean;
  canEdit: boolean;
  hasToken: boolean;
  onRevoke?: () => void;
  owner: string;
  summary: ReportShareSummary;
}>) {
  const t = useTranslations("challengeReport.share");
  return (
    <>
      <section className="grid gap-2">
        <h2 className="m-0 text-ui-section">{t("people")}</h2>
        <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-ui-body">
          <span>{owner}</span>
          <span className="text-ui-caption text-fg-muted">{t("owner")}</span>
        </p>
        <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-ui-body">
          <Button size="input" href={summary.teamHref} variant="ghost">
            {t("members", { count: summary.memberCount })}
          </Button>
          <span className="text-ui-caption text-fg-muted">{t("canView")}</span>
        </p>
      </section>
      <section className="grid gap-2">
        <h2 className="m-0 text-ui-section">{t("general")}</h2>
        <p className="m-0 text-ui-body">
          {t(summary.access === "link" ? "accessLink" : "accessMembers")}
        </p>
        <p className="m-0 text-ui-caption text-fg-muted">{t("accessHelp")}</p>
        {summary.access === "link" && !hasToken ? (
          <p className="m-0 text-ui-caption text-fg-muted">{t("replaceLinkHelp")}</p>
        ) : null}
        {summary.access === "link" && onRevoke ? (
          <Button
            className="justify-self-start"
            disabled={!canEdit || busy}
            onClick={onRevoke}
            size="input"
            variant="secondary"
          >
            {t("revokeConfirm")}
          </Button>
        ) : null}
      </section>
    </>
  );
}

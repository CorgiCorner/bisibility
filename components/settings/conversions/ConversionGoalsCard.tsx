"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { formatCount } from "@/lib/conversions/format";
import type { ConversionActionResult, SettingsConversionGoal } from "@/lib/conversions/types";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type UpdateGoal = (input: {
  countsRevenue?: boolean;
  displayName?: string;
  enabled?: boolean;
  goalId: string;
  projectId: string;
}) => Promise<ConversionActionResult>;

function GoalRow({
  canEdit,
  goal,
  onError,
  projectId,
  updateGoal,
}: Readonly<{
  canEdit: boolean;
  goal: SettingsConversionGoal;
  onError: (message: string | null) => void;
  projectId: string;
  updateGoal: UpdateGoal;
}>) {
  const t = useTranslations("projectSettingsConversions");
  const locale = useLocale();
  const router = useRouter();
  const [enabled, setEnabled] = useState(goal.enabled);
  const [countsRevenue, setCountsRevenue] = useState(goal.countsRevenue);
  const [pending, setPending] = useState(false);

  async function save(patch: { countsRevenue?: boolean; displayName?: string; enabled?: boolean }) {
    setPending(true);
    onError(null);
    try {
      const result = await updateGoal({ ...patch, goalId: goal.id, projectId });
      if (!result.ok) {
        setEnabled(goal.enabled);
        setCountsRevenue(goal.countsRevenue);
        onError(t("goals.error"));
        return;
      }
      router.refresh();
    } catch {
      setEnabled(goal.enabled);
      setCountsRevenue(goal.countsRevenue);
      onError(t("goals.error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className="flex items-center gap-3 border-b border-border py-2"
      data-conversion-goal={goal.id}
    >
      <Input
        aria-label={t("goals.displayNameLabel", { name: goal.sourceName })}
        className="min-w-0 flex-1"
        defaultValue={goal.displayName}
        density="compact"
        disabled={!canEdit || pending}
        key={`${goal.id}:${goal.displayName}`}
        onBlur={(event) => {
          const displayName = event.currentTarget.value.trim();
          if (!displayName) {
            onError(t("goals.error"));
            return;
          }
          if (displayName !== goal.displayName) void save({ displayName });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="min-w-0 flex-1 truncate text-ui-caption text-fg-muted">
        {goal.sourceLabel} · {formatCount(goal.last28, locale)}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <Switch
          checked={enabled}
          disabled={!canEdit || pending}
          label={t("goals.enabled")}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setEnabled(next);
            void save({ enabled: next });
          }}
        />
        {goal.reportsRevenue ? (
          <Switch
            checked={countsRevenue}
            disabled={!canEdit || pending}
            label={t("goals.countsRevenue")}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              setCountsRevenue(next);
              void save({ countsRevenue: next });
            }}
          />
        ) : null}
      </span>
    </li>
  );
}

export function ConversionGoalsCard({
  canEdit,
  goals,
  projectId,
  updateGoal,
}: Readonly<{
  canEdit: boolean;
  goals: SettingsConversionGoal[];
  projectId: string;
  updateGoal: UpdateGoal;
}>) {
  const t = useTranslations("projectSettingsConversions");
  const [error, setError] = useState<string | null>(null);

  return (
    <SettingsCard description={t("goals.description")} showSave={false} title={t("goals.title")}>
      {goals.length === 0 ? (
        <EmptyState description={t("goals.emptyDescription")} title={t("goals.emptyTitle")} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {goals.map((goal) => (
            <GoalRow
              canEdit={canEdit}
              goal={goal}
              key={`${goal.id}:${goal.displayName}:${goal.enabled}:${goal.countsRevenue}`}
              onError={setError}
              projectId={projectId}
              updateGoal={updateGoal}
            />
          ))}
        </ul>
      )}
      {error ? <p className="m-0 mt-3 text-sm text-fg-muted">{error}</p> : null}
    </SettingsCard>
  );
}

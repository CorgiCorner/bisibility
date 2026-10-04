"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { useTranslations } from "next-intl";
import { moveSummary, type ScheduleEditorMember } from "./ScheduleEditorModel";
import { scheduleMemberTableColumns } from "./schedule-members-table-columns";

type ScheduleEditorMembersProps = {
  canEdit?: boolean;
  memberCount: number;
  memberSummary?: string;
  onOpenDrawer: () => void;
  pendingMembers: readonly ScheduleEditorMember[];
  scheduleName: string;
  storedMembers: readonly ScheduleEditorMember[];
};

export function ScheduleEditorMembers({
  canEdit = true,
  memberCount,
  memberSummary,
  onOpenDrawer,
  pendingMembers,
  scheduleName,
  storedMembers,
}: Readonly<ScheduleEditorMembersProps>) {
  const t = useTranslations("projectRuns.schedules");
  const members = [...storedMembers, ...pendingMembers];
  const rows = members.map((member) => ({ ...member, id: member.publicId }));
  const consequence = moveSummary(pendingMembers, scheduleName, {
    combine: (scheduled, manual) => t("editor.moveCombined", { manual, scheduled }),
    manual: (count) => t("editor.moveManual", { count }),
    scheduled: (count) => t("editor.moveScheduled", { count }),
    summary: (summary, name) => t("editor.moveSummary", { name, summary }),
  });

  return (
    <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-fg">{t("editor.members")}</span>
          <span className="mt-0.5 block text-[12.5px] leading-5 text-fg-muted">
            {memberSummary ?? t("editor.memberCount", { count: memberCount })}
          </span>
        </span>
        {canEdit ? (
          <Button onClick={onOpenDrawer} size="sm" type="button" variant="secondary">
            {t("addKeywords")}
          </Button>
        ) : null}
      </header>

      {members.length ? (
        <div className="min-w-0">
          <DataTable
            bordered={false}
            ariaLabel={t("editor.membersTable")}
            columns={scheduleMemberTableColumns(t)}
            id="schedule-editor-members"
            layout="auto"
            onSortingChange={() => undefined}
            rows={rows}
            sorting={null}
          />
        </div>
      ) : (
        <p className="m-0 px-4 py-4 text-[12px] leading-5 text-fg-muted">
          {t("editor.memberEmpty")}
        </p>
      )}
      {consequence ? (
        <p className="m-0 border-t border-border px-4 py-3 text-[11.5px] leading-5 text-fg-muted">
          {consequence}
        </p>
      ) : null}
      {members.length ? (
        <div className="border-t border-border px-4 py-3 text-[11px] tabular-nums text-fg-muted">
          {t("editor.memberRange", { shown: members.length, total: memberCount })}
        </div>
      ) : null}
    </section>
  );
}

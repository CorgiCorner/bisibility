"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { moveSummary, type ScheduleEditorMember } from "./ScheduleEditorModel";
import { scheduleMemberTableColumns } from "./schedule-members-table-columns";

type ScheduleEditorMembersProps = {
  memberCount: number;
  memberSummary?: string;
  onOpenDrawer: () => void;
  pendingMembers: readonly ScheduleEditorMember[];
  scheduleName: string;
  storedMembers: readonly ScheduleEditorMember[];
};

export function ScheduleEditorMembers({
  memberCount,
  memberSummary,
  onOpenDrawer,
  pendingMembers,
  scheduleName,
  storedMembers,
}: Readonly<ScheduleEditorMembersProps>) {
  const members = [...storedMembers, ...pendingMembers];
  const rows = members.map((member) => ({ ...member, id: member.publicId }));
  const consequence = moveSummary(pendingMembers, scheduleName);

  return (
    <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-fg">Members</span>
          <span className="mt-0.5 block text-[12.5px] leading-5 text-fg-muted">
            {memberSummary ?? `${memberCount} keywords`}
          </span>
        </span>
        <Button onClick={onOpenDrawer} size="sm" type="button" variant="secondary">
          Add keywords
        </Button>
      </header>

      {members.length ? (
        <div className="min-w-0 [&>[role=table]]:border-0">
          <DataTable
            ariaLabel="Schedule members"
            columns={scheduleMemberTableColumns}
            id="schedule-editor-members"
            layout="auto"
            onSortingChange={() => undefined}
            rows={rows}
            sorting={null}
          />
        </div>
      ) : (
        <p className="m-0 px-4 pb-3.5 pt-1.5 text-[12px] leading-5 text-fg-muted">
          No keywords yet. Add some to start scheduled checks.
        </p>
      )}
      {consequence ? (
        <p className="m-0 border-t border-border px-4 py-3 text-[11.5px] leading-5 text-fg-muted">
          {consequence}
        </p>
      ) : null}
      {members.length ? (
        <div className="border-t border-border px-4 py-3 text-[11px] tabular-nums text-fg-muted">
          1-{members.length} of {memberCount} {memberCount === 1 ? "keyword" : "keywords"}
        </div>
      ) : null}
    </section>
  );
}

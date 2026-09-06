import { Button } from "@/components/ui";
import { moveSummary, type ScheduleEditorMember } from "./ScheduleEditorModel";

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
            <thead className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Keyword</th>
                <th className="w-[130px] px-4 py-2.5">Checks</th>
                <th className="w-[210px] px-4 py-2.5">Pending</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr className="border-t border-border text-[12px]" key={member.publicId}>
                  <td className="truncate px-4 py-[11px] font-semibold text-fg">{member.name}</td>
                  <td className="px-4 py-[11px] tabular-nums text-fg-muted">
                    {member.targetCount} checks
                  </td>
                  <td className="px-4 py-[11px] text-[11.5px] leading-5 text-fg-muted">
                    {member.pending ? `Moves from ${member.sourceName ?? "manual"}` : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

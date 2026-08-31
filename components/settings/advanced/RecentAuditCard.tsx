import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import { Avatar, Button } from "@/components/ui";
import type { AuditEntry } from "@/lib/queries/audit";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";

type RecentAuditCardProps = {
  entries: readonly AuditEntry[];
  projectId: string;
};

export function RecentAuditCard({ entries, projectId }: Readonly<RecentAuditCardProps>) {
  return (
    <AdvancedCardFrame
      className={advancedCardGeometryClassNames.audit}
      description="The five most recent entries. Filtering, inspection and export are available on the full audit screen."
      footer={
        <Button
          endIcon={<ArrowRight aria-hidden size={13} weight="regular" />}
          href={appPath(projectId, "settings", "audit")}
          size="sm"
          variant="secondary"
        >
          Open audit log
        </Button>
      }
      id="audit"
      title="Audit log"
    >
      {entries.length ? (
        <div className="divide-y divide-border-soft overflow-hidden rounded-control border border-border">
          {entries.slice(0, 5).map((entry) => (
            <div
              className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[34px_minmax(0,1fr)_auto] sm:items-center"
              key={entry.id}
            >
              <Avatar
                alt=""
                className="row-span-2 h-8.5 w-[34px] rounded-control border border-border bg-bg-sunken font-mono text-[10px] font-semibold text-fg-muted sm:row-span-1"
                initials={entry.actor.initials}
                src={entry.actor.avatarUrl}
              />
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-fg">
                  {entry.actor.name}
                </div>
                <div
                  className={cn(
                    "truncate text-[11.5px] text-fg-muted",
                    entry.status === "failed" && "text-red-text",
                  )}
                >
                  {entry.eventName}
                  {entry.statusReason ? ` - ${entry.statusReason}` : ""}
                </div>
              </div>
              <time
                className="col-start-2 font-mono text-[10px] text-fg-muted sm:col-start-3"
                dateTime={entry.timestamp}
              >
                {entry.timestampLabel}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 rounded-control border border-border bg-bg-sunken px-3 py-4 text-[12.5px] text-fg-muted">
          No audit entries yet.
        </p>
      )}
    </AdvancedCardFrame>
  );
}

import { ExternalLink, ThemeSegments } from "@/components/ui";
import { instanceAdminNavItem } from "@/lib/nav/nav-items";

type AppFooterProps = {
  schemaStatus?: "drift" | "ok" | "unknown";
  showInstanceAdmin: boolean;
  workerStatus?: "ok" | "stale" | "unknown";
};

type InstanceAdminStatus = Required<Pick<AppFooterProps, "schemaStatus" | "workerStatus">>;

function footerStatus({ schemaStatus, workerStatus }: InstanceAdminStatus) {
  if (schemaStatus === "drift") {
    return { color: "var(--red)", label: `${instanceAdminNavItem.label} · Schema drift` };
  }
  if (workerStatus === "stale") {
    return { color: "var(--yellow)", label: `${instanceAdminNavItem.label} · Worker down` };
  }
  if (workerStatus === "unknown") {
    return { color: "var(--fg-muted)", label: `${instanceAdminNavItem.label} · Manual mode` };
  }
  return { color: "var(--green)", label: instanceAdminNavItem.label };
}

export function AppFooter({
  schemaStatus,
  showInstanceAdmin,
  workerStatus,
}: Readonly<AppFooterProps>) {
  const status =
    showInstanceAdmin && schemaStatus && workerStatus
      ? footerStatus({ schemaStatus, workerStatus })
      : null;

  return (
    <footer className="flex min-h-12 items-center justify-between gap-3 border-border border-t px-4 text-xs text-fg-muted sm:px-5 lg:px-7">
      {status ? (
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <ExternalLink
            className="[&_svg]:size-[1em] transition-colors hover:text-fg"
            href={instanceAdminNavItem.href}
          >
            {status.label}
          </ExternalLink>
        </div>
      ) : (
        <span />
      )}
      <ThemeSegments size="sm" />
    </footer>
  );
}

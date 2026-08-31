import { ExternalLink, ThemeSegments } from "@/components/ui";
import { instanceAdminNavItem } from "@/lib/nav/nav-items";

type AppFooterProps = {
  schemaStatus?: "drift" | "ok" | "unknown";
  showInstanceAdmin: boolean;
  temporalIdentityDetail?: string;
  temporalIdentityStatus?: "match" | "mismatch" | "unknown";
  workerStatus?: "ok" | "stale" | "unknown";
};

type InstanceAdminStatus = Required<Pick<AppFooterProps, "schemaStatus" | "workerStatus">> &
  Pick<AppFooterProps, "temporalIdentityDetail" | "temporalIdentityStatus">;

function footerStatus({
  schemaStatus,
  temporalIdentityDetail,
  temporalIdentityStatus,
  workerStatus,
}: InstanceAdminStatus) {
  if (schemaStatus === "drift") {
    return {
      color: "var(--red)",
      detail: null,
      label: `${instanceAdminNavItem.label} · Schema drift`,
    };
  }
  if (temporalIdentityStatus === "mismatch") {
    return {
      color: "var(--red)",
      detail: temporalIdentityDetail ?? null,
      label: `${instanceAdminNavItem.label} · Worker on different queues`,
    };
  }
  if (workerStatus === "stale") {
    return {
      color: "var(--yellow)",
      detail: null,
      label: `${instanceAdminNavItem.label} · Worker down`,
    };
  }
  if (workerStatus === "unknown") {
    return {
      color: "var(--fg-muted)",
      detail: null,
      label: `${instanceAdminNavItem.label} · Manual mode`,
    };
  }
  return { color: "var(--green)", detail: null, label: instanceAdminNavItem.label };
}

export function AppFooter({
  schemaStatus,
  showInstanceAdmin,
  temporalIdentityDetail,
  temporalIdentityStatus,
  workerStatus,
}: Readonly<AppFooterProps>) {
  const status =
    showInstanceAdmin && schemaStatus && workerStatus
      ? footerStatus({
          schemaStatus,
          temporalIdentityDetail,
          temporalIdentityStatus,
          workerStatus,
        })
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
          <div className="min-w-0 py-1">
            <ExternalLink
              className="[&_svg]:size-[1em] transition-colors hover:text-fg"
              href={instanceAdminNavItem.href}
            >
              {status.label}
            </ExternalLink>
            {status.detail ? (
              <p
                className="truncate font-mono text-[9px] leading-tight text-fg-muted"
                title={status.detail}
              >
                {status.detail}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <span />
      )}
      <ThemeSegments size="sm" />
    </footer>
  );
}

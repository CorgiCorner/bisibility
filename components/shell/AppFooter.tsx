import { ThemeSegments } from "@/components/ui";
import { instanceAdminNavItem } from "@/lib/nav/nav-items";
import Link from "next/link";

type AppFooterProps = {
  schemaStatus: "drift" | "ok" | "unknown";
  workerStatus: "ok" | "stale" | "unknown";
};

function footerStatus({ schemaStatus, workerStatus }: AppFooterProps) {
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

export function AppFooter(props: Readonly<AppFooterProps>) {
  const status = footerStatus(props);

  return (
    <footer className="flex min-h-12 items-center justify-between gap-3 border-border border-t px-4 text-xs text-fg-muted sm:px-5 lg:px-7">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: status.color }}
        />
        <Link className="transition-colors hover:text-fg" href={instanceAdminNavItem.href}>
          {status.label}
        </Link>
      </div>
      <ThemeSegments size="sm" />
    </footer>
  );
}

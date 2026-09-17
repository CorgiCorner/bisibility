"use client";

// The footer's only message source is the workspace shell's client boundary, so it has to
// render on that side of the boundary: as a Server Component it reads the request config
// instead, which carries `shared` alone and cannot resolve `shell.footer`.

import { PrivacyChoicesLink } from "@/components/analytics/PrivacyChoicesLink";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { ThemeSegments } from "@/components/ui/ThemeSegments";
import { instanceAdminNavItem } from "@/lib/nav/nav-items";
import { useTranslations } from "next-intl";

type AppFooterProps = {
  schemaStatus?: "drift" | "ok" | "unknown";
  showInstanceAdmin: boolean;
  temporalIdentityDetail?: string;
  temporalIdentityStatus?: "match" | "mismatch" | "unknown";
  workerStatus?: "ok" | "stale" | "unknown";
};

type InstanceAdminStatus = Required<Pick<AppFooterProps, "schemaStatus" | "workerStatus">> &
  Pick<AppFooterProps, "temporalIdentityDetail" | "temporalIdentityStatus">;

function footerStatus(
  t: ReturnType<typeof useTranslations<"shell.footer">>,
  {
    schemaStatus,
    temporalIdentityDetail,
    temporalIdentityStatus,
    workerStatus,
  }: InstanceAdminStatus,
) {
  if (schemaStatus === "drift") {
    return {
      color: "var(--red)",
      detail: null,
      label: t("instanceStatus.schemaDrift"),
    };
  }
  if (temporalIdentityStatus === "mismatch") {
    return {
      color: "var(--red)",
      detail: temporalIdentityDetail ?? null,
      label: t("instanceStatus.workerDifferentQueues"),
    };
  }
  if (workerStatus === "stale") {
    return {
      color: "var(--yellow)",
      detail: null,
      label: t("instanceStatus.workerDown"),
    };
  }
  if (workerStatus === "unknown") {
    return {
      color: "var(--fg-muted)",
      detail: null,
      label: t("instanceStatus.manualMode"),
    };
  }
  return { color: "var(--green)", detail: null, label: t("instanceStatus.healthy") };
}

export function AppFooter({
  schemaStatus,
  showInstanceAdmin,
  temporalIdentityDetail,
  temporalIdentityStatus,
  workerStatus,
}: Readonly<AppFooterProps>) {
  const t = useTranslations("shell.footer");
  const status =
    showInstanceAdmin && schemaStatus && workerStatus
      ? footerStatus(t, {
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
              <p className="truncate text-[9px] leading-tight text-fg-muted" title={status.detail}>
                {status.detail}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <PrivacyChoicesLink label={t("privacyChoices")} />
        <ThemeSegments size="sm" />
      </div>
    </footer>
  );
}

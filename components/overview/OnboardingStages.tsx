"use client";

import type { GettingStartedCapabilities } from "@/components/overview/getting-started";
import { SampleDataButton } from "@/components/sample-data/SampleDataButton";
import { Button } from "@/components/ui/Button";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { ArrowLineDownIcon as ArrowLineDown } from "@phosphor-icons/react/dist/csr/ArrowLineDown";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const googleOauthConsoleUrl = "https://console.cloud.google.com/apis/credentials";

// The underline cannot be dropped: these links sit in --fg-muted copy and are themselves
// --fg-muted, so colour carries no signal at all (1.08:1 against the surrounding text, and no
// colour in the palette reaches the 3:1 that would let the underline go). It is instead kept
// quiet by default - a hairline in --border - and only wakes up under the pointer.
const quietLinkClass =
  "font-semibold text-fg-muted underline decoration-border underline-offset-2 transition-colors hover:text-fg hover:decoration-accent-text";

function selfHostedImportHref(projectRef: ProjectRef) {
  const query = new URLSearchParams({ ctx: "settings", project: projectRef });
  return ["/cloud/import?", query.toString()].join("");
}

export function StagePanel({
  action,
  description,
  quiet,
  title,
}: Readonly<{
  action?: ReactNode;
  description: string;
  quiet?: ReactNode;
  title: string;
}>) {
  return (
    <div className="mt-4">
      <h3 className="m-0 text-[16px] font-semibold text-fg">{title}</h3>
      <p className="m-0 mt-1 text-[13px] leading-[1.55] text-fg-muted">{description}</p>
      {action ? <div className="mt-3.5 flex flex-wrap items-center gap-3">{action}</div> : null}
      {quiet ? <p className="m-0 mt-3 text-[12.5px] leading-[1.6] text-fg-muted">{quiet}</p> : null}
    </div>
  );
}

function QuietAlternatives({
  canCreateKeywords,
  projectRef,
}: Readonly<{ canCreateKeywords: boolean; projectRef: ProjectRef }>) {
  const t = useTranslations("projectDashboard.emptyOnboarding");
  return t.rich("connect.alternatives", {
    canCreateKeywords: canCreateKeywords ? "true" : "other",
    manual: (chunks) => (
      <Link className={quietLinkClass} href={appPath(projectRef, "rank-tracker?add=1")}>
        {chunks}
      </Link>
    ),
    provider: (chunks) => (
      <Link className={quietLinkClass} href={appPath(projectRef, "integrations")}>
        {chunks}
      </Link>
    ),
  });
}

export function ConnectStage({
  capabilities,
  gscOAuthConfigured,
  projectRef,
}: Readonly<{
  capabilities: GettingStartedCapabilities;
  gscOAuthConfigured: boolean;
  projectRef: ProjectRef;
}>) {
  const t = useTranslations("projectDashboard.emptyOnboarding");
  if (!capabilities.canManageProviders) {
    return (
      <StagePanel
        description={t("connect.permissionDescription")}
        title={t("connect.permissionTitle")}
      />
    );
  }
  const quiet = (
    <QuietAlternatives canCreateKeywords={capabilities.canCreateKeywords} projectRef={projectRef} />
  );
  if (!gscOAuthConfigured) {
    // Without an OAuth client the GSC path leads to Google Cloud Console; say so instead
    // of pretending the button opens Search Console.
    return (
      <StagePanel
        action={
          <Button
            component="a"
            endIcon={<ArrowUpRight size={14} weight="regular" />}
            href={googleOauthConsoleUrl}
            rel="noreferrer"
            target="_blank"
            variant="secondary"
          >
            {t("connect.oauthAction")}
          </Button>
        }
        description={t("connect.oauthDescription")}
        quiet={quiet}
        title={t("connect.oauthTitle")}
      />
    );
  }
  return (
    <StagePanel
      action={
        <Button
          component={Link}
          endIcon={<CaretRight size={14} weight="regular" />}
          href={appPath(projectRef, "integrations?connect=gsc")}
          startIcon={<MagnifyingGlass size={15} weight="regular" />}
          variant="primary"
        >
          {t("connect.action")}
        </Button>
      }
      description={t("connect.description")}
      quiet={quiet}
      title={t("connect.title")}
    />
  );
}

export function KeywordsStage({
  canCreateKeywords,
  canImportQueries,
  onImport,
  pending,
  projectRef,
}: Readonly<{
  canCreateKeywords: boolean;
  canImportQueries: boolean;
  onImport: () => void;
  pending: boolean;
  projectRef: ProjectRef;
}>) {
  const t = useTranslations("projectDashboard.emptyOnboarding");
  if (!canCreateKeywords) {
    return (
      <StagePanel
        description={t("keywords.permissionDescription")}
        title={t("keywords.permissionTitle")}
      />
    );
  }
  if (canImportQueries) {
    return (
      <StagePanel
        action={
          <Button
            loading={pending}
            loadingLabel={t("import.loading")}
            onClick={onImport}
            startIcon={<ArrowLineDown size={15} weight="regular" />}
            variant="primary"
          >
            {t("keywords.importAction")}
          </Button>
        }
        description={t("keywords.importDescription")}
        quiet={t.rich("keywords.manualAlternative", {
          manual: (chunks) => (
            <Link className={quietLinkClass} href={appPath(projectRef, "rank-tracker?add=1")}>
              {chunks}
            </Link>
          ),
        })}
        title={t("keywords.importTitle")}
      />
    );
  }
  return (
    <StagePanel
      action={
        <Button
          component={Link}
          endIcon={<CaretRight size={14} weight="regular" />}
          href={appPath(projectRef, "rank-tracker?add=1")}
          variant="primary"
        >
          {t("keywords.manualAction")}
        </Button>
      }
      description={t("keywords.manualDescription")}
      title={t("keywords.manualTitle")}
    />
  );
}

export function OptionsFooter({
  capabilities,
  projectRef,
}: Readonly<{ capabilities: GettingStartedCapabilities; projectRef: ProjectRef }>) {
  const t = useTranslations("projectDashboard.emptyOnboarding");
  if (!capabilities.canInstallSampleData && !capabilities.canManageImports) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-[12.5px] text-fg-muted">
      {capabilities.canInstallSampleData ? (
        <span>
          {t.rich("options.sample", {
            label: t("options.sampleAction"),
            sample: () => (
              /* Match the quiet adjacent links, including their plain-space separation. */
              <SampleDataButton
                label={t("options.sampleAction")}
                size="sm"
                style={{
                  "--control-color": "var(--fg-muted)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  minHeight: 0,
                  paddingLeft: 0,
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  verticalAlign: "baseline",
                  "--control-text-decoration": "underline",
                  "--control-text-decoration-color": "var(--border)",
                  "--control-text-underline-offset": "2px",
                  "--control-hover-background-color": "transparent",
                  "--control-hover-color": "var(--fg)",
                  "--control-hover-text-decoration": "underline",
                  "--control-hover-text-decoration-color": "var(--border)",
                  "--control-disabled-color": "var(--fg-muted)",
                  "--control-disabled-opacity": 0.6,
                  "--control-disabled-text-decoration": "underline",
                  "--control-disabled-text-decoration-color": "var(--border)",
                }}
                variant="ghost"
              />
            ),
          })}
        </span>
      ) : null}
      {capabilities.canManageImports ? (
        <span>
          {t.rich("options.selfHosted", {
            import: (chunks) => (
              <Link className={quietLinkClass} href={selfHostedImportHref(projectRef)}>
                {chunks}
              </Link>
            ),
          })}
        </span>
      ) : null}
    </div>
  );
}

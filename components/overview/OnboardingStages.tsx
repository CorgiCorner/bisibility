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
import type { ReactNode } from "react";

const googleOauthConsoleUrl = "https://console.cloud.google.com/apis/credentials";

// The underline cannot be dropped: these links sit in --fg-muted copy and are themselves
// --fg-muted, so colour carries no signal at all (1.08:1 against the surrounding text, and no
// colour in the palette reaches the 3:1 that would let the underline go). It is instead kept
// quiet by default - a hairline in --border - and only wakes up under the pointer.
const quietLinkClass =
  "font-semibold text-fg-muted underline decoration-border underline-offset-2 transition-colors hover:text-fg hover:decoration-accent-text";

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
  return (
    <>
      Prefer your own data?{" "}
      <Link className={quietLinkClass} href={appPath(projectRef, "integrations")}>
        Use a SERP provider
      </Link>
      {canCreateKeywords ? (
        <>
          {" "}
          or{" "}
          <Link className={quietLinkClass} href={appPath(projectRef, "rank-tracker?add=1")}>
            add keywords manually
          </Link>
        </>
      ) : null}
      .
    </>
  );
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
  if (!capabilities.canManageProviders) {
    return (
      <StagePanel
        description="Ask a project admin to connect Search Console or a SERP provider."
        title="Connect a data source"
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
            Set up Google OAuth
          </Button>
        }
        description="Search Console is the free path, but this instance has no Google OAuth client yet. Create one first, then come back here."
        quiet={quiet}
        title="Connect a data source"
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
          Connect Search Console
        </Button>
      }
      description="Free, one click, and it brings the queries your domain already ranks for."
      quiet={quiet}
      title="Connect Search Console"
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
  if (!canCreateKeywords) {
    return (
      <StagePanel
        description="Ask a project member with keyword access to add the first keywords."
        title="Add keywords"
      />
    );
  }
  if (canImportQueries) {
    return (
      <StagePanel
        action={
          <Button
            loading={pending}
            loadingLabel="Loading queries..."
            onClick={onImport}
            startIcon={<ArrowLineDown size={15} weight="regular" />}
            variant="primary"
          >
            Import your top queries
          </Button>
        }
        description="Search Console already knows what your domain ranks for. Pick from your real queries instead of typing a list."
        quiet={
          <>
            Or{" "}
            <Link className={quietLinkClass} href={appPath(projectRef, "rank-tracker?add=1")}>
              add keywords manually
            </Link>
            .
          </>
        }
        title="Track your real queries"
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
          Add keywords
        </Button>
      }
      description="Paste a list or import a CSV for your domain."
      title="Add keywords"
    />
  );
}

export function OptionsFooter({
  capabilities,
  projectRef,
}: Readonly<{ capabilities: GettingStartedCapabilities; projectRef: ProjectRef }>) {
  if (!capabilities.canInstallSampleData && !capabilities.canManageImports) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-[12.5px] text-fg-muted">
      {capabilities.canInstallSampleData ? (
        <span>
          Just exploring?{" "}
          {/* Match the quiet adjacent links, including their plain-space separation. */}
          <SampleDataButton
            label="Load sample project"
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
          .
        </span>
      ) : null}
      {capabilities.canManageImports ? (
        <span>
          Coming from self-host?{" "}
          <Link
            className={quietLinkClass}
            href={`/cloud/import?ctx=settings&project=${encodeURIComponent(projectRef)}`}
          >
            Import your data
          </Link>
          .
        </span>
      ) : null}
    </div>
  );
}

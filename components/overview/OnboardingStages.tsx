"use client";

import type { GettingStartedCapabilities } from "@/components/overview/getting-started";
import { SampleDataButton } from "@/components/sample-data/SampleDataButton";
import { Button } from "@/components/ui";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import {
  ArrowLineDownIcon as ArrowLineDown,
  ArrowUpRightIcon as ArrowUpRight,
  CaretRightIcon as CaretRight,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

const googleOauthConsoleUrl = "https://console.cloud.google.com/apis/credentials";

// The underline cannot be dropped: these links sit in --fg-muted copy and are themselves
// --fg-muted, so colour carries no signal at all (1.08:1 against the surrounding text, and no
// colour in the palette reaches the 3:1 that would let the underline go). It is instead kept
// quiet by default - a hairline in --border-strong - and only wakes up under the pointer.
const quietLinkClass =
  "font-semibold text-fg-muted underline decoration-border-strong underline-offset-2 transition-colors hover:text-fg hover:decoration-accent-text";

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
          <Link className={quietLinkClass} href={appPath(projectRef, "keywords?add=1")}>
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
            endIcon={<ArrowUpRight size={14} weight="bold" />}
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
          endIcon={<CaretRight size={14} weight="bold" />}
          href={appPath(projectRef, "integrations?connect=gsc")}
          startIcon={<MagnifyingGlass size={15} weight="bold" />}
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
            startIcon={<ArrowLineDown size={15} weight="bold" />}
            variant="primary"
          >
            Import your top queries
          </Button>
        }
        description="Search Console already knows what your domain ranks for. Pick from your real queries instead of typing a list."
        quiet={
          <>
            Or{" "}
            <Link className={quietLinkClass} href={appPath(projectRef, "keywords?add=1")}>
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
          endIcon={<CaretRight size={14} weight="bold" />}
          href={appPath(projectRef, "keywords?add=1")}
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
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border-soft pt-4 text-[12.5px] text-fg-muted">
      {capabilities.canInstallSampleData ? (
        <span>
          Just exploring?{" "}
          {/* Styled like the quiet links beside it; the MUI text variant's primary color
              made this the loudest thing in a footer meant to whisper. The separator is a
              plain space and the padding is zero, exactly like the link in the next item:
              a flex gap plus button padding put 10px here against that item's 4px, so the
              two halves of one footer line were spaced differently. */}
          <SampleDataButton
            label="Load sample project"
            size="small"
            sx={{
              color: "var(--fg-muted)",
              fontSize: "12.5px",
              fontWeight: 600,
              minHeight: 0,
              px: 0,
              py: 0,
              verticalAlign: "baseline",
              textDecoration: "underline",
              textDecorationColor: "var(--border-strong)",
              textUnderlineOffset: "2px",
              "&:hover": {
                backgroundColor: "transparent",
                color: "var(--fg)",
                textDecoration: "underline",
                textDecorationColor: "var(--border-strong)",
              },
              // While the action runs the button is disabled, and MUI repaints a disabled
              // button in its own grey - which dropped this link out of the sentence it sits
              // in. It keeps its colour and its underline, and only dims.
              "&.Mui-disabled": {
                color: "var(--fg-muted)",
                opacity: 0.6,
                textDecoration: "underline",
                textDecorationColor: "var(--border-strong)",
              },
            }}
            variant="text"
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

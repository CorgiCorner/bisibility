"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button, SectionTitle } from "@/components/ui";
import { reportAppError } from "@/lib/observability/error-reporting";
import { FEEDBACK_URL, GITHUB_ISSUES_URL } from "@/lib/site/site";
import {
  CheckIcon as Check,
  CopyIcon as Copy,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AppErrorDiagnostics } from "./AppErrorDiagnostics";

type AppErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * The error sink is an external system, so reporting the caught error is genuine
 * synchronization rather than derived state.
 */
function useReportViewError(error: Error & { digest?: string }, pathname: string) {
  useEffect(() => {
    console.error("[app-shell] route error", error);
    reportAppError(error, { digest: error.digest, pathname });
  }, [error, pathname]);
}

function formatOccurredAt(date: Date) {
  return `${date.toISOString().slice(11, 19)} UTC`;
}

function CopyViewUrlButton({ pathname }: Readonly<{ pathname: string }>) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setButtonRef = useCallback((node: HTMLButtonElement | null) => {
    if (!node && resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  async function copyUrl() {
    const url = typeof window === "undefined" ? pathname : window.location.href || pathname;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      resetTimer.current = null;
      setCopied(false);
    }, 1200);
  }

  return (
    <button
      aria-label={copied ? "URL copied" : "Copy URL"}
      className="inline-flex h-7 flex-none items-center gap-1.5 rounded-control border border-border-strong bg-bg px-2 font-sans text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
      onClick={() => void copyUrl()}
      ref={setButtonRef}
      type="button"
    >
      {copied ? (
        <Check aria-hidden size={13} weight="regular" />
      ) : (
        <Copy aria-hidden size={13} weight="regular" />
      )}
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

export default function AppErrorBoundary({ error, reset }: Readonly<AppErrorBoundaryProps>) {
  const deploymentMode = useDeploymentMode();
  const pathname = usePathname();
  const viewPath = pathname || "/app";
  const [isRetrying, startRetry] = useTransition();
  // Frozen at the moment the boundary caught the error. A server render and the
  // client hydration produce different clocks, hence suppressHydrationWarning
  // on the readout in AppErrorDiagnostics.
  const [occurredAt] = useState(() => formatOccurredAt(new Date()));

  useReportViewError(error, viewPath);

  return (
    <div className="py-8">
      <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-card border border-border bg-bg">
        <div className="flex h-[46px] items-center justify-between gap-3 border-b border-border bg-bg-elev px-4.5">
          <div className="flex min-w-0 items-center gap-[9px] font-sans text-[11px] text-fg-muted">
            <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-red" />
            <span className="truncate text-fg-muted">{viewPath}</span>
          </div>
          <CopyViewUrlButton pathname={viewPath} />
        </div>

        <div className="flex flex-col items-center px-10 pb-10 pt-11 text-center">
          <span className="grid h-[52px] w-[52px] place-items-center rounded-card bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-red-text">
            <WarningCircle aria-hidden size={26} weight="regular" />
          </span>
          <p className="mt-5 font-sans text-[9px] font-semibold leading-[1.45] uppercase tracking-[1.7px] text-red-text">
            View error
          </p>
          <SectionTitle className="mt-3.5 text-[23px] tracking-[-0.7px]" component="h1" size="lg">
            This view stopped rendering
          </SectionTitle>
          <p className="mt-2.5 max-w-[44ch] text-[14px] leading-[1.6] text-fg-muted">
            {deploymentMode === "cloud" ? (
              <>
                The app kept running, so your data is safe. Try the view again - if it keeps
                failing, share the error reference with{" "}
                <a className="font-semibold text-accent-text hover:underline" href={FEEDBACK_URL}>
                  support
                </a>
                .
              </>
            ) : (
              <>
                The app kept running, so your data is safe. Try the view again - if it keeps
                failing, copy the details and{" "}
                <a
                  className="font-semibold text-accent-text hover:underline"
                  href={GITHUB_ISSUES_URL}
                >
                  open an issue
                </a>
                .
              </>
            )}
          </p>

          <div className="mt-5.5 flex flex-wrap items-center justify-center gap-[9px]">
            <Button
              loading={isRetrying}
              loadingLabel="Retrying"
              onClick={() => startRetry(() => reset())}
              size="lg"
              type="button"
            >
              Try again
            </Button>
            <Button component={Link} href="/app" size="lg" variant="secondary">
              Go to Overview
            </Button>
          </div>

          <AppErrorDiagnostics
            deploymentMode={deploymentMode}
            details={{
              digest: error.digest,
              message: error.message,
              name: error.name,
              occurredAt,
              pathname: viewPath,
              stack: error.stack,
            }}
          />
        </div>
      </div>
    </div>
  );
}

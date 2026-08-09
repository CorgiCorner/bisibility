"use client";

import { Button, MonoText, SectionTitle } from "@/components/ui";
import {
  ArrowClockwiseIcon as ArrowClockwise,
  LifebuoyIcon as Lifebuoy,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AppErrorDiagnostics } from "./AppErrorDiagnostics";

type AppErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Sentry is an external system, so reporting the caught error is genuine
 * synchronization rather than derived state.
 */
function useReportViewError(error: Error & { digest?: string }, pathname: string) {
  useEffect(() => {
    console.error("[app-shell] route error", error);
    Sentry.withScope((scope) => {
      scope.setContext("nextjs", {
        digest: error.digest,
        pathname,
      });

      if (error.digest) {
        scope.setTag("next.digest", error.digest);
      }

      Sentry.captureException(error);
    });
  }, [error, pathname]);
}

function formatOccurredAt(date: Date) {
  return `${date.toISOString().slice(11, 19)} UTC`;
}

export default function AppErrorBoundary({ error, reset }: Readonly<AppErrorBoundaryProps>) {
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
      <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-border bg-bg">
        <div className="flex h-[46px] items-center justify-between gap-3 border-b border-border bg-bg-elev px-[18px]">
          <div className="flex min-w-0 items-center gap-[9px] font-mono text-[11px] text-fg-muted">
            <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-red" />
            <span className="truncate text-fg-muted">{viewPath}</span>
          </div>
          {/* The mock says "Sidebar still works", but this boundary sits above
              the workspace layout, so the sidebar is unmounted here. */}
          <span className="hidden flex-none font-mono text-[10.5px] uppercase tracking-[1px] text-fg-muted sm:inline">
            App still running
          </span>
        </div>

        <div className="flex flex-col items-center px-10 pb-10 pt-11 text-center">
          <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-red-text">
            <WarningCircle aria-hidden size={26} weight="bold" />
          </span>
          <MonoText
            className="font-semibold uppercase tracking-[1.7px]"
            size="sm"
            sx={{ color: "var(--red)", marginTop: "20px" }}
          >
            View error
          </MonoText>
          <SectionTitle
            className="mt-[14px] text-[23px] tracking-[-0.7px]"
            component="h1"
            size="lg"
          >
            This view stopped rendering
          </SectionTitle>
          <p className="mt-2.5 max-w-[44ch] text-[14px] leading-[1.6] text-fg-muted">
            The app kept running, so your data is safe. Try the view again - if it keeps failing,
            copy the details and open an issue.
          </p>

          <div className="mt-[22px] flex flex-wrap items-center justify-center gap-[9px]">
            <Button
              loading={isRetrying}
              loadingLabel="Retrying"
              onClick={() => startRetry(() => reset())}
              size="lg"
              startIcon={<ArrowClockwise size={16} weight="bold" />}
              type="button"
            >
              Try again
            </Button>
            <Button
              component={Link}
              href="/app"
              size="lg"
              startIcon={<Lifebuoy size={15} weight="bold" />}
              variant="secondary"
            >
              Go to Overview
            </Button>
          </div>

          <AppErrorDiagnostics
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

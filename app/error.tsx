"use client";

import {
  SystemPage,
  SystemPrimaryAction,
  SystemSecondaryAction,
  TerminalBlock,
} from "@/components/marketing/system/SystemPage";
import { reportAppError } from "@/lib/observability/error-reporting";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: Readonly<ErrorPageProps>) {
  const pathname = usePathname();
  const note = error.digest ? `reference ${error.digest}` : "try the request again";

  useEffect(() => {
    reportAppError(error, { digest: error.digest, pathname });
  }, [error, pathname]);

  return (
    <SystemPage
      actions={
        <>
          <SystemPrimaryAction
            onClick={reset}
            startIcon={<ArrowClockwise size={16} weight="regular" />}
          >
            Try again
          </SystemPrimaryAction>
          <SystemSecondaryAction href="/app">Back to dashboard</SystemSecondaryAction>
        </>
      }
      description="The request fell outside a clean ranking run. Try again, or head back to the dashboard while we recover the route."
      kicker="500 - SERVER ERROR"
      statusLabel="HTTP 500"
      terminal={
        <TerminalBlock
          note={note}
          path={pathname || "/app"}
          routes={["/dashboard", "/docs", "/"]}
          status="500"
        />
      }
      title="The tracker hit an error"
    />
  );
}

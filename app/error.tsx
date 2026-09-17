"use client";

import { EmergencyRecovery } from "@/components/i18n/EmergencyRecovery";
import { EmergencyMessagesProvider } from "@/i18n/EmergencyMessagesProvider";
import { reportAppError } from "@/lib/observability/error-reporting";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: Readonly<ErrorPageProps>) {
  const pathname = usePathname();

  useEffect(() => {
    reportAppError(error, { digest: error.digest, pathname });
  }, [error, pathname]);

  return (
    <EmergencyMessagesProvider>
      <EmergencyRecovery kind="error" onReset={reset} />
    </EmergencyMessagesProvider>
  );
}

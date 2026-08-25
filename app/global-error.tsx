"use client";

import { reportAppError } from "@/lib/observability/error-reporting";
import NextError from "next/error";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
};

export default function GlobalError({ error }: Readonly<GlobalErrorProps>) {
  useEffect(() => {
    reportAppError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={500} />
      </body>
    </html>
  );
}

"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
};

export default function GlobalError({ error }: Readonly<GlobalErrorProps>) {
  useEffect(() => {
    Sentry.withScope((scope) => {
      if (error.digest) {
        scope.setTag("next.digest", error.digest);
      }

      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={500} />
      </body>
    </html>
  );
}

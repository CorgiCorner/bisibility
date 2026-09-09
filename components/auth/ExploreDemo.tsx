"use client";

import { Button } from "@/components/ui/Button";
import { DEMO_ENTRY_CODE } from "@/lib/demo/config";
import { useState } from "react";

export function ExploreDemo() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explore() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/demo/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: DEMO_ENTRY_CODE }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string" || !result.url.startsWith("/app/")) {
        throw new Error("Demo is temporarily unavailable. Please try again later.");
      }
      window.location.assign(result.url);
    } catch {
      setError("Demo is temporarily unavailable. Please try again later.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-2xl font-semibold">Explore bisibility</h1>
      <p className="m-0 text-sm text-fg-muted">
        Browse a read-only project with saved keyword rankings. No account or email required.
      </p>
      <Button loading={pending} loadingLabel="Opening demo..." onClick={explore}>
        Explore demo
      </Button>
      {error ? (
        <p className="m-0 text-sm text-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

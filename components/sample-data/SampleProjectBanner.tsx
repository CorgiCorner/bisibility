"use client";

import { removeSampleData } from "@/lib/actions/sample-data";
import { appPath, asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import Button from "@mui/material/Button";
import { DatabaseIcon as Database, TrashIcon as Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type SampleProjectBannerProps = {
  projectId: string;
  projectRef?: ProjectRef;
};

export function SampleProjectBanner({ projectId, projectRef }: Readonly<SampleProjectBannerProps>) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  let removeLabel = "Remove sample data";
  if (pending) removeLabel = "Removing...";
  else if (confirming) removeLabel = "Confirm removal";

  function removeSampleProject() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }

    startTransition(() => {
      void removeSampleData({ projectId })
        .then(() => {
          router.push(appPath(projectRef ?? asProjectRef(projectId), "overview"));
          router.refresh();
        })
        .catch((error_: unknown) => {
          setError(actionErrorMessage(error_, "Sample data could not be removed."));
        });
    });
  }

  return (
    <section className="rounded-[14px] border border-border bg-bg-elev px-4 py-3.5 sm:flex sm:items-center sm:gap-4">
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent sm:mb-0">
        <Database aria-hidden size={19} weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[14px] font-semibold text-fg">This is a sample project</h2>
        <p className="m-0 mt-1 text-[12.5px] leading-[1.45] text-fg-muted">
          The rankings, traffic, and timeline events here are generated demo data.
        </p>
        {error ? (
          <p className="m-0 mt-2 text-xs text-red" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center">
        {confirming ? (
          <Button
            color="inherit"
            disabled={pending}
            onClick={() => setConfirming(false)}
            size="small"
            sx={{ color: "var(--fg-muted)", minHeight: 34 }}
            type="button"
            variant="text"
          >
            Cancel
          </Button>
        ) : null}
        <Button
          color="inherit"
          component={Link}
          href="/onboarding?new=1"
          size="small"
          sx={{
            borderColor: "var(--border-strong)",
            color: "var(--fg)",
            minHeight: 34,
            whiteSpace: "nowrap",
          }}
          variant="outlined"
        >
          Create your real project
        </Button>
        <Button
          disabled={pending}
          onClick={removeSampleProject}
          size="small"
          startIcon={<Trash size={14} weight="bold" />}
          sx={{
            borderColor: "var(--red)",
            color: "var(--red)",
            minHeight: 34,
            whiteSpace: "nowrap",
            "&:hover": { borderColor: "var(--red)", backgroundColor: "var(--bg-sunken)" },
          }}
          type="button"
          variant="outlined"
        >
          {removeLabel}
        </Button>
      </div>
    </section>
  );
}

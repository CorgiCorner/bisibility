"use client";

import { ConfirmModal, iconWellClassName } from "@/components/ui";
import { removeSampleData } from "@/lib/actions/sample-data";
import { appPath, asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import Button from "@mui/material/Button";
import { DatabaseIcon as Database, TrashIcon as Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type SampleProjectBannerProps = {
  projectId: string;
  projectRef?: ProjectRef;
};

export function SampleProjectBanner({ projectId, projectRef }: Readonly<SampleProjectBannerProps>) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function confirmRemoveSampleData() {
    await removeSampleData({ projectId });
    setConfirmOpen(false);
    router.push(appPath(projectRef ?? asProjectRef(projectId), "dashboard"));
    router.refresh();
  }

  return (
    <section className="rounded-card border border-border bg-bg-elev px-4 py-3.5 sm:flex sm:items-center sm:gap-4">
      <span
        className={`mb-3 grid h-9 w-9 place-items-center rounded-control sm:mb-0 ${iconWellClassName}`}
      >
        <Database aria-hidden size={19} weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[13px] font-semibold leading-[1.5] text-fg">
          This is a sample project
        </h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-fg-muted">
          The rankings, traffic, and timeline events here are generated demo data.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center">
        <Button
          color="inherit"
          component={Link}
          href="/onboarding?new=1"
          size="small"
          sx={{
            borderColor: "var(--border)",
            color: "var(--fg)",
            minHeight: 34,
            whiteSpace: "nowrap",
          }}
          variant="outlined"
        >
          Create your real project
        </Button>
        <Button
          onClick={() => setConfirmOpen(true)}
          size="small"
          startIcon={<Trash aria-hidden size={14} weight="bold" />}
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
          Remove sample data
        </Button>
      </div>
      <ConfirmModal
        kind="removeSampleData"
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmRemoveSampleData}
        open={confirmOpen}
      />
    </section>
  );
}

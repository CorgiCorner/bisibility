"use client";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { iconWellClassName } from "@/components/ui/icon-well-styles";
import { removeSampleData } from "@/lib/actions/sample-data";
import { appPath, asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { TestTubeIcon as TestTube } from "@phosphor-icons/react/dist/csr/TestTube";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
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
        <TestTube
          aria-hidden
          data-icon="test-tube"
          data-testid="sample-project-banner-icon"
          data-weight="regular"
          size={19}
          weight="regular"
        />
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
        <Button component={Link} href="/onboarding?new=1" size="sm" variant="secondary">
          Create your real project
        </Button>
        <Button
          onClick={() => setConfirmOpen(true)}
          size="sm"
          startIcon={<Trash aria-hidden size={14} weight="regular" />}
          style={{
            "--control-background-color": "var(--bg-elev)",
            "--control-border": "1px solid var(--red)",
            "--control-color": "var(--red)",
            whiteSpace: "nowrap",
            "--control-hover-background-color": "var(--bg-sunken)",
            "--control-hover-border": "1px solid var(--red)",
          }}
          type="button"
          variant="secondary"
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

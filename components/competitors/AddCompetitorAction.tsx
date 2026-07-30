"use client";

import { AddCompetitorDrawer } from "@/components/competitors/AddCompetitorDrawer";
import { Button } from "@/components/ui";
import type { SuggestedCompetitor } from "@/lib/competitors/types";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { useState } from "react";

type AddCompetitorActionProps = {
  canCreate: boolean;
  projectId: string;
  suggestions?: SuggestedCompetitor[];
};

export function AddCompetitorAction({
  canCreate,
  projectId,
  suggestions = [],
}: Readonly<AddCompetitorActionProps>) {
  const [open, setOpen] = useState(false);

  if (!canCreate) return null;

  return (
    <>
      <Button
        className="shrink-0"
        onClick={() => setOpen(true)}
        size="sm"
        startIcon={<Plus aria-hidden size={14} weight="bold" />}
        type="button"
      >
        Add competitor
      </Button>
      <AddCompetitorDrawer
        canCreate={canCreate}
        onClose={() => setOpen(false)}
        open={open}
        projectId={projectId}
        suggestions={suggestions}
      />
    </>
  );
}

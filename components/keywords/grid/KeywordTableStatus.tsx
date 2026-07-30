"use client";

import { Button, EmptyState } from "@/components/ui";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";

export type KeywordNoRowsState = {
  description: string;
  onResetScope?: () => void;
  title: string;
};

export function KeywordNoRowsOverlay({ state }: Readonly<{ state?: KeywordNoRowsState }>) {
  const title = state?.title ?? "No keywords match your filter";
  const description =
    state?.description ?? "Try another saved view or remove the active keyword filter.";
  const onResetScope = state?.onResetScope;
  const action = onResetScope ? (
    <Button onClick={onResetScope} size="sm" type="button" variant="secondary">
      Show all locations &amp; devices
    </Button>
  ) : undefined;

  return (
    <div className="p-4">
      <EmptyState
        action={action}
        description={description}
        icon={<MagnifyingGlass size={22} />}
        title={title}
      />
    </div>
  );
}

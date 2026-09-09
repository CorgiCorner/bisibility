"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";

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
        icon={<MagnifyingGlass weight="regular" size={22} />}
        title={title}
      />
    </div>
  );
}

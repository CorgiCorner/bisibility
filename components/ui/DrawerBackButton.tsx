"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";

export type DrawerBackAction = { label: string; onClick: () => void };

export function DrawerBackButton({ label, onClick }: Readonly<DrawerBackAction>) {
  return (
    <button
      aria-label={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-fg-muted outline-none transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:bg-bg-sunken focus-visible:ring-2 focus-visible:ring-accent"
      onClick={onClick}
      title={label}
      type="button"
    >
      <ArrowLeftIcon aria-hidden size={18} weight="regular" />
    </button>
  );
}

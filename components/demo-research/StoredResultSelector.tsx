"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type StoredResultOption = { label: string; value: string };

type StoredResultSelectorProps = {
  actorKind: "owner" | "viewer";
  options: StoredResultOption[];
  selectedValue?: string;
  title: string;
};

export function StoredResultSelector({
  actorKind,
  options,
  selectedValue,
  title,
}: Readonly<StoredResultSelectorProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const selected = selectedValue ?? options[0]?.value ?? "";

  return (
    <header className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg-elev px-4 py-3">
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
          Saved results
        </p>
        <h1 className="m-0 mt-0.5 text-[18px] font-semibold text-fg">{title}</h1>
      </div>
      {options.length > 0 ? (
        <MenuSelect
          ariaLabel={`Choose saved ${title.toLowerCase()} result`}
          onChange={(value) => router.push(`${pathname}?saved=${encodeURIComponent(value)}`)}
          options={options}
          size="toolbar"
          value={selected}
        />
      ) : null}
      {actorKind === "owner" ? (
        <Link
          className="font-semibold text-accent-text hover:underline"
          href={`${pathname}?demoManage=1`}
        >
          New lookup
        </Link>
      ) : null}
    </header>
  );
}

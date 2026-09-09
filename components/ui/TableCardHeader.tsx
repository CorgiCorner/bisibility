import type { ReactNode } from "react";

export function TableCardHeader({
  actions,
  title,
  titleId,
}: Readonly<{ actions: ReactNode; title: ReactNode; titleId: string }>) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <h2 className="m-0 text-[15px] font-semibold text-fg" id={titleId}>
        {title}
      </h2>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}

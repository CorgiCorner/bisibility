import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { appPath } from "@/lib/routing/app-path";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/ssr/BookmarkSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import Link from "next/link";

type SavedKeywordsEmptyStateProps = {
  copy: {
    browseResearch: string;
    cpc: string;
    difficulty: string;
    emptyDescription: string;
    emptyTitle: string;
    intent: string;
    keyword: string;
    volume: string;
  };
  projectRef: string;
};

export function SavedKeywordsEmptyState({
  copy,
  projectRef,
}: Readonly<SavedKeywordsEmptyStateProps>) {
  const headers = [
    { className: "", label: copy.keyword },
    { className: "text-right", label: copy.volume },
    { className: "", label: copy.difficulty },
    { className: "text-right", label: copy.cpc },
    { className: "", label: copy.intent },
  ] as const;
  return (
    <Card className="overflow-hidden p-0" size="md">
      <div className="grid grid-cols-[minmax(0,1.4fr)_90px_60px_70px_80px] items-center gap-2 border-b border-border px-4.5 py-2.5">
        {headers.map((header) => (
          <span
            className={`font-sans tabular-nums text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted ${header.className}`}
            key={header.label}
          >
            {header.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col items-center px-8 pb-14 pt-[52px] text-center">
        <span className="grid h-[54px] w-[54px] place-items-center rounded-card bg-accent-soft text-accent-solid">
          <BookmarkSimple size={26} weight="regular" />
        </span>
        <h2 className="mb-0 mt-4.5 text-[18px] font-semibold tracking-[-0.4px] text-fg">
          {copy.emptyTitle}
        </h2>
        <p className="mb-0 mt-[7px] max-w-[440px] text-[13.5px] leading-[1.55] text-fg-muted">
          {copy.emptyDescription}
        </p>
        <Button
          component={Link}
          href={appPath(projectRef, "keyword-research")}
          size="md"
          startIcon={<MagnifyingGlass size={13} weight="regular" />}
          style={{ marginTop: "22px", minHeight: 40, paddingInline: "18px" }}
        >
          {copy.browseResearch}
        </Button>
      </div>
    </Card>
  );
}

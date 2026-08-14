import { Button, Card } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

const headers = [
  { className: "", label: "Keyword" },
  { className: "text-right", label: "Volume" },
  { className: "", label: "KD" },
  { className: "text-right", label: "CPC" },
  { className: "", label: "Intent" },
] as const;

export function SavedKeywordsEmptyState({ projectRef }: Readonly<{ projectRef: string }>) {
  return (
    <Card className="overflow-hidden p-0" size="md">
      <div className="grid grid-cols-[minmax(0,1.4fr)_90px_60px_70px_80px] items-center gap-2 border-b border-border px-[18px] py-2.5">
        {headers.map((header) => (
          <span
            className={`font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted ${header.className}`}
            key={header.label}
          >
            {header.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col items-center px-8 pb-14 pt-[52px] text-center">
        <span className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-accent-soft text-accent-text">
          <BookmarkSimple size={26} weight="fill" />
        </span>
        <h2 className="mb-0 mt-[18px] text-[18px] font-semibold tracking-[-0.4px] text-fg">
          Nothing saved yet
        </h2>
        <p className="mb-0 mt-[7px] max-w-[440px] text-[13.5px] leading-[1.55] text-fg-muted">
          Save ideas from Research to build a shortlist before you commit to tracking. Saving is
          free and runs no checks.
        </p>
        <Button
          component={Link}
          href={appPath(projectRef, "keyword-research")}
          size="md"
          startIcon={<MagnifyingGlass size={13} weight="bold" />}
          sx={{ marginTop: "22px", minHeight: 40, paddingInline: "18px" }}
        >
          Find keywords in Research
        </Button>
        <p className="mb-0 mt-4 text-[12.5px] text-fg-muted">
          Tracked keywords cost provider budget every month. Save first, track when you are ready.
        </p>
      </div>
    </Card>
  );
}

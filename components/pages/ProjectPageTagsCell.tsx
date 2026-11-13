"use client";

import { TagChip } from "@/components/ui/TagChip";
import type { ProjectPageTagChip } from "@/lib/pages/types";
import { useTranslations } from "next-intl";

const VISIBLE_TAGS = 2;

export function ProjectPageTagsCell({ tags }: Readonly<{ tags: readonly ProjectPageTagChip[] }>) {
  const t = useTranslations("projectPages");
  if (tags.length === 0) return <span className="text-fg-muted">-</span>;
  const visible = tags.slice(0, VISIBLE_TAGS);
  const extra = tags.length - visible.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {visible.map((tag) => (
        <TagChip key={tag.id} label={tag.name} />
      ))}
      {extra > 0 ? (
        <span className="text-ui-micro text-fg-muted">
          {t("columns.tagsMore", { count: extra })}
        </span>
      ) : null}
    </span>
  );
}

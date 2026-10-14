"use client";

import { HelpButton } from "@/components/ui/HelpButton";
import { Tooltip } from "@/components/ui/Tooltip";
import type { BusinessTranslator } from "./contracts";

export function BusinessSectionHeading({
  id,
  title,
  summary,
  help,
  translate: t,
}: {
  id?: string;
  title: string;
  summary?: string;
  help: string;
  translate: BusinessTranslator;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 id={id} className="m-0 min-w-0 text-[16px] font-semibold leading-5 text-fg">
          {title}
        </h2>
        <Tooltip content={help} semantics="description">
          <HelpButton
            aria-label={t("helpLabel", { section: title })}
            className="size-6 min-h-6 shrink-0 p-0 text-fg-muted"
          />
        </Tooltip>
      </div>
      {summary ? <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">{summary}</p> : null}
    </div>
  );
}

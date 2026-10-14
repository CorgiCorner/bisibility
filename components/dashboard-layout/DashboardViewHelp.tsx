"use client";

import { HelpButton } from "@/components/ui/HelpButton";
import { Tooltip } from "@/components/ui/Tooltip";

export function DashboardViewHelp({ label, description }: { label: string; description: string }) {
  return (
    <Tooltip content={description} semantics="description" placement="top">
      <HelpButton
        aria-label={label}
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            (event.currentTarget.dataset.state === "delayed-open" ||
              event.currentTarget.dataset.state === "instant-open")
          )
            event.stopPropagation();
        }}
      />
    </Tooltip>
  );
}

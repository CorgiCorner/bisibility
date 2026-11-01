"use client";

import { HelpButton } from "@/components/ui/HelpButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";

export function DashboardViewHelp({
  label,
  description,
  warning = false,
}: {
  label: string;
  description: string;
  warning?: boolean;
}) {
  return (
    <Tooltip content={description} semantics="description" placement="top">
      <HelpButton
        aria-label={label}
        icon={warning ? <WarningCircleIcon aria-hidden size={14} weight="regular" /> : undefined}
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

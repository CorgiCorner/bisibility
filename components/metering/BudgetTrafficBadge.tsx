"use client";

import { PillBadge } from "@/components/ui/Pill";
import { BrowserIcon } from "@phosphor-icons/react/dist/csr/Browser";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import type { BudgetRow } from "@usagekit/views";
import { useUsagePresentation } from "./use-usage-presentation";

export function BudgetTrafficBadge({ traffic }: { traffic: BudgetRow["traffic"] }) {
  const p = useUsagePresentation();
  const app = traffic.kind === "surface" && traffic.surface === "app";
  const programmatic = traffic.kind === "surface" && traffic.surface === "programmatic";
  const Icon = app ? BrowserIcon : programmatic ? TerminalWindowIcon : SquaresFourIcon;
  const label =
    traffic.kind === "any"
      ? p.operation("any")
      : traffic.kind === "surface"
        ? p.operation(traffic.surface)
        : p.dimension("source", traffic.source);
  return (
    <PillBadge
      className={`max-w-full shrink text-[11px] font-normal normal-case tracking-normal gap-1 ${app ? "border-accent/25 bg-accent-soft text-accent-text" : "text-fg-muted"}`}
    >
      <Icon aria-hidden size={12} weight="regular" className="shrink-0" />
      <span className="min-w-0 whitespace-normal leading-snug">{label}</span>
    </PillBadge>
  );
}

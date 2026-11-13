"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { AGENT_REPORT_LIST_KINDS } from "@/lib/agent-reports/kinds";
import { usePathname, useRouter } from "next/navigation";

export function AgentReportKindFilter({
  label,
  labels,
  value,
}: Readonly<{
  label: string;
  labels: Readonly<Record<string, string>>;
  value: string;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <MenuSelect
      triggerWrapperClassName="w-auto max-w-xs shrink-0"
      ariaLabel={label}
      onChange={(next) => {
        const params = new URLSearchParams();
        if (next !== "all") params.set("kind", next);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
      }}
      options={AGENT_REPORT_LIST_KINDS.map((kind) => ({
        label: labels[kind] ?? kind,
        value: kind,
      }))}
      value={value}
    />
  );
}

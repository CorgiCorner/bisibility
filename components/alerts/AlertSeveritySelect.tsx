"use client";

import { MenuSelect } from "@/components/ui";
import { ruleSeverityMeta } from "@/lib/alerts/new-rule-data";
import { type AlertSeverity, alertSeverities } from "@/lib/alerts/severity";

const options = alertSeverities.map((value) => ({
  icon: (
    <span
      className="h-2 w-2 rounded-full"
      style={{ backgroundColor: ruleSeverityMeta[value].color }}
    />
  ),
  label: ruleSeverityMeta[value].label,
  value,
}));

export function AlertSeveritySelect({
  onChange,
  value,
}: Readonly<{ onChange: (value: AlertSeverity) => void; value: AlertSeverity }>) {
  return (
    <div className="flex flex-col gap-[7px]">
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        Severity
      </span>
      <MenuSelect
        ariaLabel="Severity"
        leadingIcon={
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: ruleSeverityMeta[value].color }}
          />
        }
        onChange={(next) => onChange(next as AlertSeverity)}
        options={options}
        triggerClassName="mb-3 min-h-10 w-full justify-between rounded-[9px] border-border-strong bg-transparent px-3 text-[13px] font-medium [&>span:nth-of-type(2)]:flex-1 [&>span:nth-of-type(2)]:text-left"
        value={value}
      />
    </div>
  );
}

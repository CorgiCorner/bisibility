"use client";

import { MenuSelect, quietChipVariants } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { DeviceMobileIcon as DeviceMobile, MonitorIcon as Monitor } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

type TargetSwitcherProps = {
  keyword: KeywordRow;
  onEdit?: () => void;
  projectId: string;
  targets: readonly KeywordRow[];
};

function targetLabel(target: KeywordRow) {
  const market = `${target.location.displayName} / ${target.location.languageLabel ?? target.location.hl}`;
  return `${market} · ${target.device}`;
}

function scheduleLabel(target: KeywordRow) {
  return target.checkSchedule?.name ?? "Manual";
}

function DeviceIcon({ device }: Readonly<{ device: string }>) {
  return device.toLowerCase() === "mobile" ? (
    <DeviceMobile aria-hidden size={14} weight="regular" />
  ) : (
    <Monitor aria-hidden size={14} weight="regular" />
  );
}

export function TargetSwitcher({
  keyword,
  onEdit,
  projectId,
  targets,
}: Readonly<TargetSwitcherProps>) {
  const router = useRouter();
  const targetList = [
    ...new Map([keyword, ...targets].map((target) => [target.id, target])).values(),
  ];
  const market = `${keyword.location.displayName} / ${keyword.location.languageLabel ?? keyword.location.hl}`;
  const options = [
    ...targetList.map((target) => ({
      label: targetLabel(target),
      trailing: (
        <span className="font-sans tabular-nums text-[11px] text-fg-muted">
          {scheduleLabel(target)}
        </span>
      ),
      value: target.id,
    })),
    ...(onEdit ? [{ label: "Edit markets and devices", value: "edit-markets" }] : []),
  ];

  return (
    <MenuSelect
      ariaLabel={market}
      leadingIcon={<DeviceIcon device={keyword.device} />}
      menuMinWidth={320}
      onChange={(value) => {
        if (value === "edit-markets") {
          onEdit?.();
          return;
        }
        if (value !== keyword.id) {
          router.push(appPath(asProjectRef(projectId), "rank-tracker", value));
        }
      }}
      options={options}
      selectedContent={() => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{market}</span>
          <span className="rounded-full border border-border px-1.5 py-px text-[9.5px] font-semibold text-fg-muted">
            {targetList.length} targets
          </span>
        </span>
      )}
      triggerClassName={`${quietChipVariants({ size: "lg" })} max-w-[290px] font-sans tabular-nums text-fg-muted outline-none transition-colors hover:border-accent hover:text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-solid`}
      triggerTitle={market}
      value={keyword.id}
    />
  );
}

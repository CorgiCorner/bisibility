import { type MarketGridViewRow, marketGridParent } from "@/lib/keywords/market-grid-model";
import { type KeywordViewDevice, keywordViewDevices } from "@/lib/keywords/view-devices";
import type { KeywordRow } from "@/lib/queries/keywords";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { useFormatter, useTranslations } from "next-intl";
import { KeywordCellHelp } from "./KeywordCellHelp";
import { MarketKeywordCell } from "./market-grid-cells";

export function keywordRowDevices(row: KeywordRow): KeywordViewDevice[] {
  const parent = marketGridParent(row);
  const rows = parent ? ((row as MarketGridViewRow).subRows ?? parent.aggregate.children) : [row];
  return keywordViewDevices(rows);
}

export function keywordViewHasMultipleDevices(rows: readonly KeywordRow[]) {
  return new Set(rows.flatMap(keywordRowDevices)).size > 1;
}

function DeviceIndicator({ row }: Readonly<{ row: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const format = useFormatter();
  const devices = keywordRowDevices(row);
  if (!devices.length) return null;
  const label = format.list(
    devices.map((device) => t(device === "mobile" ? "deviceMobile" : "deviceDesktop")),
    { type: "conjunction" },
  );
  return (
    <KeywordCellHelp label={label} description={label} className="flex shrink-0 items-center">
      <span
        aria-label={label}
        className="inline-flex items-center gap-0.5 text-fg-muted"
        role="img"
      >
        {devices.map((device) => {
          const Icon = device === "mobile" ? DeviceMobile : Monitor;
          return <Icon aria-hidden key={device} size={14} weight="regular" />;
        })}
      </span>
    </KeywordCellHelp>
  );
}

export function KeywordDeviceCell({
  projectRef,
  row,
  href,
  showDevice = false,
}: Readonly<{
  projectRef: string;
  row: KeywordRow;
  href?: string;
  showDevice?: boolean;
}>) {
  return (
    <span className="flex w-full min-w-0 items-center gap-1.5">
      {showDevice ? <DeviceIndicator row={row} /> : null}
      <MarketKeywordCell projectRef={projectRef} row={row} href={href} />
    </span>
  );
}

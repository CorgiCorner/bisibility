import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";
import type { NewMarketCreateInput } from "./create-input";
import type { MarketDeviceSelection } from "./device-targets-input";

// Source selections are resolved into authoritative tuples by the read-only review loader.
export function marketCreateChange(input: NewMarketCreateInput): KeywordCreateChange {
  return {
    op: "keywords-create",
    keywords: [],
    scheduleId: null,
    cadence: null,
    source: { kind: "market-create", input },
  };
}
export function marketDevicesChange(input: MarketDeviceSelection): KeywordCreateChange {
  return {
    op: "keywords-create",
    keywords: [],
    scheduleId: null,
    cadence: null,
    source: { kind: "market-devices", input },
  };
}

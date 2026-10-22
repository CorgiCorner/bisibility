import { KEYWORD_IMPORT_MAX } from "@/lib/schemas/keyword";
import { z } from "zod";

export const marketDeviceSelectionSchema = z
  .object({
    projectId: z.string().regex(/^prj_[a-z][a-z0-9]{23}$/),
    marketId: z.string().regex(/^pmkt_[a-z][a-z0-9]{23}$/),
    device: z.enum(["desktop", "mobile"]),
    keywordIds: z
      .array(z.string().regex(/^kw_[a-z][a-z0-9]{23}$/))
      .max(KEYWORD_IMPORT_MAX)
      .optional(),
    scheduleId: z
      .string()
      .regex(/^sch_[a-z][a-z0-9]{23}$/)
      .nullable()
      .default(null),
  })
  .strict();
export const marketDeviceConfirmSchema = marketDeviceSelectionSchema.extend({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MarketDeviceCandidate = {
  id: string;
  keyword: string;
  existingDevices: ("desktop" | "mobile")[];
};
export type MarketDeviceSelection = z.infer<typeof marketDeviceSelectionSchema>;
export type MarketDeviceConfirm = z.infer<typeof marketDeviceConfirmSchema>;
export type MarketDeviceFailure =
  | "market_unavailable"
  | "selection_too_large"
  | "selection_changed"
  | "schedule_unavailable"
  | "ambiguous_keywords";
export type MarketDevicePreview =
  | {
      outcome: "ready";
      fingerprint: string;
      keywordCount: number;
      newCheckCount: number;
      existingCount: number;
      archivedCount: number;
      scheduleName: string | null;
    }
  | { outcome: "unavailable"; reason: MarketDeviceFailure };
export type MarketDeviceResult =
  | { outcome: "created"; created: number }
  | { outcome: "unavailable"; reason: MarketDeviceFailure };
export type MarketDeviceActions = {
  preview: (input: MarketDeviceSelection) => Promise<MarketDevicePreview>;
  add: (input: MarketDeviceConfirm) => Promise<MarketDeviceResult>;
};

export function initialMarketDevice(devices: readonly string[] = []): "desktop" | "mobile" {
  return devices.includes("mobile") && !devices.includes("desktop") ? "desktop" : "mobile";
}

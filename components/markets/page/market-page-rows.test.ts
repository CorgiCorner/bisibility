import { initialMarketDevice } from "@/lib/markets/device-targets-input";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { expect, it } from "vitest";
import { normalRow } from "./market-page-rows";

it("keeps actual tracked devices through the table projection for the direct Add device action", () => {
  const row = normalRow({
    id: "market",
    trackedDevices: ["mobile"],
  } as ProjectMarketsView["markets"][number]);
  expect(row.trackedDevices).toEqual(["mobile"]);
  expect(initialMarketDevice(row.trackedDevices)).toBe("desktop");
});

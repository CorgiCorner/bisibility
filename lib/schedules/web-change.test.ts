import { expect, it } from "vitest";
import { scheduleMessage } from "./messages";
import { aiScheduleChange } from "./web-change";

it("uses the translated missing schedule message", () => {
  expect(() => aiScheduleChange("PATCH", {}, undefined, "pl")).toThrow(
    scheduleMessage("notFound", "pl"),
  );
});

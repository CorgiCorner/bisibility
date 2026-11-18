import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  ASSISTANT_GUARD_DEFAULTS,
  centsToMicroUsd,
  parseAssistantGuardValue,
  readAssistantGuardConfig,
} from "./guard-config";

test("a guard is a positive whole number, anything else is refused", () => {
  expect(parseAssistantGuardValue(" 2500 ")).toBe(2500);
  for (const bad of ["0", "-5", "1.5", "abc", "", "99999999999999999999"])
    expect(parseAssistantGuardValue(bad)).toBeNull();
});

test("stored rows override the defaults and a malformed row keeps the default", async () => {
  const client = {
    instanceSetting: {
      findMany: async () => [
        { key: "assistant.guard.teamDailyCents", value: "250" },
        { key: "assistant.guard.platformHourlyCents", value: "-1" },
      ],
    },
  };
  const config = await readAssistantGuardConfig(client as never);
  expect(config["assistant.guard.teamDailyCents"]).toBe(250);
  expect(config["assistant.guard.platformHourlyCents"]).toBe(
    ASSISTANT_GUARD_DEFAULTS["assistant.guard.platformHourlyCents"],
  );
});

test("cents convert to the micro-USD unit of attempts", () => {
  expect(centsToMicroUsd(2000)).toBe(20_000_000n);
});

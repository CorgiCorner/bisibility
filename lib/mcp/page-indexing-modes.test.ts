import { expect, it, vi } from "vitest";
import canonical from "./canonical-contract.json";

const deployment = vi.hoisted(() => ({ isSelfHost: false }));
vi.mock("@/lib/deployment/deployment", () => deployment);

import { getMcpToolDefinitions } from "./definitions";

it.each([false, true])("lists deployment-supported inspection modes (self-host=%s)", (selfHost) => {
  deployment.isSelfHost = selfHost;
  const tool = getMcpToolDefinitions().find(
    (entry) => entry.name === "update_page_indexing_settings",
  );
  expect(tool?.inputSchema.properties).toMatchObject({
    budget_mode: { enum: selfHost ? ["off", "fixed", "available_quota"] : ["off", "fixed"] },
  });
  expect(
    canonical.find((entry) => entry.name === tool?.name)?.inputSchema.properties,
  ).toMatchObject({
    budget_mode: { enum: ["off", "fixed", "available_quota"] },
  });
});

import { makePublicId } from "@/lib/db/public-id-resources";
import { expect, test, vi } from "vitest";

vi.mock("./rest-call", () => ({ dispatchMcpRestCall: vi.fn() }));
vi.mock("./session-profile", () => ({ dispatchSessionProfile: vi.fn() }));

import { mcpToolRestCall } from "./tools";

test("canonical tools map to REST without a credential or request", () => {
  const project = makePublicId("prj");
  expect(mcpToolRestCall("list_keywords", { project_id: project })).toMatchObject({
    method: "GET",
    path: `/projects/${project}/keywords`,
  });
  expect(() => mcpToolRestCall("get_session_profile", {})).toThrow("no REST route");
});

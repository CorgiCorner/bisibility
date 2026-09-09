import { expect, it } from "vitest";
import * as actions from "./project";

it("only publishes authorized project actions, keeping raw database helpers server-only", () => {
  expect(Object.keys(actions).sort()).toEqual([
    "completeProjectOnboarding",
    "createProject",
    "updateProjectDefaults",
  ]);
});

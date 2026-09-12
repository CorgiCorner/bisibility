import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), config: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ readDemoConfig: mocks.config }));
vi.mock("./identity", () => ({ loadConfiguredDemoActor: mocks.actor }));

import { resolveDemoAccountView } from "./account-view";

afterEach(() => vi.clearAllMocks());

describe("demo account view", () => {
  it("keeps ordinary accounts unchanged without resolving a demo actor", async () => {
    mocks.config.mockReturnValue({ kind: "disabled" });

    await expect(resolveDemoAccountView("user_1")).resolves.toBe("normal");
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy Viewer", { kind: "legacy-read-only" }, { kind: "viewer" }, "locked"],
    ["editable Viewer", { kind: "editable" }, { kind: "viewer" }, "locked"],
    ["editable Owner", { kind: "editable" }, { kind: "owner" }, "normal"],
    ["editable membership drift", { kind: "editable" }, null, "locked"],
  ])("resolves %s from the revalidated actor", async (_name, config, actor, expected) => {
    mocks.config.mockReturnValue(config);
    mocks.actor.mockResolvedValue(actor);

    await expect(resolveDemoAccountView("user_1")).resolves.toBe(expected);
    expect(mocks.actor).toHaveBeenCalledWith("user_1");
  });
});

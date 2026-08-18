import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCloudWelcomeSequence } from "./welcome-signup";

const mocks = vi.hoisted(() => ({
  startFollowup: vi.fn(),
}));

vi.mock("@/lib/temporal/welcome-email-client", () => ({
  startWelcomeFollowupWorkflow: mocks.startFollowup,
}));

const user = { email: "ada@example.com", id: "user_1", name: "Ada" };

describe("signup welcome sequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startFollowup.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts only the durable workflow in Cloud", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");

    await sendCloudWelcomeSequence(user);

    expect(mocks.startFollowup).toHaveBeenCalledWith("user_1");
  });

  it("does nothing for self-hosted signups", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "self-host");

    await sendCloudWelcomeSequence(user);

    expect(mocks.startFollowup).not.toHaveBeenCalled();
  });

  it("contains a start failure without failing signup", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.startFollowup.mockRejectedValue(new Error("temporal unavailable"));

    await expect(sendCloudWelcomeSequence(user)).resolves.toBeUndefined();
    expect(mocks.startFollowup).toHaveBeenCalledWith("user_1");
    expect(error).toHaveBeenCalledTimes(1);
  });
});

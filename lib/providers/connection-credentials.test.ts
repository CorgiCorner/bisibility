import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConnectionCredentials } from "./connection-credentials";
import { deploymentProviderCredentials } from "./credential-extension";
import { resolveProviderCredentials } from "./credentials";

vi.mock("./credential-extension", () => ({
  deploymentProviderCredentials: vi.fn(),
}));

vi.mock("./credentials", () => ({
  resolveProviderCredentials: vi.fn(),
}));

const hostedCredentials = vi.mocked(deploymentProviderCredentials);
const ownCredentials = vi.mocked(resolveProviderCredentials);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveConnectionCredentials", () => {
  it("resolves own credentials through the stored-secret resolver only", async () => {
    ownCredentials.mockReturnValue({ login: "own@example.org", password: "own-password" });

    const result = await resolveConnectionCredentials({
      provider: "dataforseo",
      credentialsEncrypted: "stored-own-secret",
      credentialSource: "own",
    });

    expect(result).toEqual({ login: "own@example.org", password: "own-password" });
    expect(ownCredentials).toHaveBeenCalledTimes(1);
    expect(ownCredentials).toHaveBeenCalledWith("dataforseo", "stored-own-secret");
    expect(hostedCredentials).not.toHaveBeenCalled();
  });

  it("resolves hosted credentials exclusively and never inspects stored credentials", async () => {
    hostedCredentials.mockResolvedValue({ apiKey: "hosted-key" });

    const result = await resolveConnectionCredentials({
      provider: "serpapi",
      credentialsEncrypted: "hosted-sentinel-encrypted",
      credentialSource: "hosted",
    });

    expect(result).toEqual({ apiKey: "hosted-key" });
    expect(hostedCredentials).toHaveBeenCalledTimes(1);
    expect(hostedCredentials).toHaveBeenCalledWith("serpapi");
    expect(ownCredentials).not.toHaveBeenCalled();
  });

  it("never falls back to own credentials when hosted resolution yields null", async () => {
    hostedCredentials.mockResolvedValue(null);

    const result = await resolveConnectionCredentials({
      provider: "serpapi",
      credentialsEncrypted: "hosted-sentinel-encrypted",
      credentialSource: "hosted",
    });

    expect(result).toBeNull();
    expect(ownCredentials).not.toHaveBeenCalled();
  });

  it("propagates a rejected hosted resolution without falling back", async () => {
    const failure = new Error("hosted provider rejected");
    hostedCredentials.mockRejectedValue(failure);

    await expect(
      resolveConnectionCredentials({
        provider: "serpapi",
        credentialsEncrypted: null,
        credentialSource: "hosted",
      }),
    ).rejects.toBe(failure);

    expect(ownCredentials).not.toHaveBeenCalled();
  });

  it("fails closed when the runtime credential source is invalid", async () => {
    const result = await resolveConnectionCredentials({
      provider: "serpapi",
      credentialsEncrypted: null,
      credentialSource: "unexpected" as "own" | "hosted",
    });

    expect(result).toBeNull();
    expect(hostedCredentials).not.toHaveBeenCalled();
    expect(ownCredentials).not.toHaveBeenCalled();
  });
});

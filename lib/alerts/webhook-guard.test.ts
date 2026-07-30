import { afterEach, describe, expect, it, vi } from "vitest";
import { assertWebhookUrlAllowed, resolveAllowedWebhookAddresses } from "./webhook-guard";

describe("webhook URL guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "https://10.0.0.5/alerts",
    "https://100.64.0.0/alerts",
    "https://100.127.255.255/alerts",
    "https://127.0.0.1/alerts",
    "https://169.254.169.254/alerts",
    "https://198.18.0.0/alerts",
    "https://198.19.255.255/alerts",
    "https://[::1]/alerts",
    "https://[fd00::1]/alerts",
    "https://[fe80::1]/alerts",
    "https://[0:0:0:0:0:0:0:1]/alerts",
    "https://[0:0:0:0:0:0:0:0]/alerts",
    "https://[::ffff:127.0.0.1]/alerts",
    "https://[::ffff:10.0.0.1]/alerts",
    "https://[::ffff:100.64.0.1]/alerts",
    "https://[::ffff:198.18.0.1]/alerts",
    "https://[0:0:0:0:0:ffff:ac10:414]/alerts",
    "https://[fe80:0:0:0:0:0:0:1]/alerts",
    "https://[fc00:0:0:0:0:0:0:1]/alerts",
  ])("rejects private IP webhook target %s", async (url) => {
    await expect(assertWebhookUrlAllowed(url)).rejects.toThrow(/private-network target/i);
  });

  it("allows public webhook targets", async () => {
    await expect(
      assertWebhookUrlAllowed("https://example.com/alerts", {
        resolveHost: async () => [{ address: "93.184.216.34" }],
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertWebhookUrlAllowed("https://[2606:4700::1111]/alerts", {
        resolveHost: async () => [{ address: "2606:4700::1111" }],
      }),
    ).resolves.toBeUndefined();
  });

  it.each(["100.63.255.255", "100.128.0.0", "198.17.255.255", "198.20.0.0"])(
    "allows public IPv4 boundary %s",
    async (address) => {
      await expect(assertWebhookUrlAllowed(`https://${address}/alerts`)).resolves.toBeUndefined();
    },
  );

  it("returns vetted DNS addresses", async () => {
    await expect(
      resolveAllowedWebhookAddresses("https://example.com/alerts", {
        resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
      }),
    ).resolves.toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("returns literal public IPv4 addresses", async () => {
    await expect(resolveAllowedWebhookAddresses("https://93.184.216.34/alerts")).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
    ]);
  });

  it("allows private-network targets when explicitly enabled", async () => {
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_NETWORK", "1");

    await expect(assertWebhookUrlAllowed("https://192.168.1.10/alerts")).resolves.toBeUndefined();
  });

  it("rejects DNS names that resolve to private IP addresses", async () => {
    await expect(
      assertWebhookUrlAllowed("https://hooks.example.test/alerts", {
        resolveHost: async () => [{ address: "172.16.4.20" }],
      }),
    ).rejects.toThrow(/private-network target/i);
  });

  it.each(["100.64.0.1", "100.127.255.254", "198.18.0.1", "198.19.255.254"])(
    "rejects DNS names that resolve to reserved IPv4 address %s",
    async (address) => {
      await expect(
        assertWebhookUrlAllowed("https://hooks.example.test/alerts", {
          resolveHost: async () => [{ address }],
        }),
      ).rejects.toThrow(/private-network target/i);
    },
  );

  it.each([
    "0:0:0:0:0:0:0:1",
    "0:0:0:0:0:0:0:0",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "0:0:0:0:0:ffff:7f00:1",
    "0:0:0:0:0:ffff:a00:1",
    "fe80:0:0:0:0:0:0:1",
    "fc00:0:0:0:0:0:0:1",
  ])("rejects DNS names that resolve to private IPv6 spelling %s", async (address) => {
    await expect(
      assertWebhookUrlAllowed("https://hooks.example.test/alerts", {
        resolveHost: async () => [{ address }],
      }),
    ).rejects.toThrow(/private-network target/i);
  });
});

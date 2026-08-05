import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseTemporalAddress, probeTemporalTransport } from "./transport-probe";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe("parseTemporalAddress", () => {
  it("parses hostnames and bracketed IPv6 addresses", () => {
    expect(parseTemporalAddress("temporal.internal:7233")).toEqual({
      host: "temporal.internal",
      port: 7233,
    });
    expect(parseTemporalAddress("[::1]:7233")).toEqual({ host: "::1", port: 7233 });
  });

  it("rejects schemes and invalid ports", () => {
    expect(() => parseTemporalAddress("https://temporal.example.com:7233")).toThrow("host:port");
    expect(() => parseTemporalAddress("temporal.internal:0")).toThrow("valid TCP port");
  });
});

describe("probeTemporalTransport", () => {
  it("connects to a reachable TCP endpoint", async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address.");

    await expect(
      probeTemporalTransport(`127.0.0.1:${address.port}`, { timeoutMs: 1_000 }),
    ).resolves.toBeUndefined();
  });
});

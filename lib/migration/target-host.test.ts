import { describe, expect, it } from "vitest";
import { loopbackTunnelCommand, migrationTargetHostKind } from "./target-host";

describe("migrationTargetHostKind", () => {
  it.each([
    "http://localhost:3000",
    "https://localhost",
    "http://127.0.0.1:3000",
    "http://127.2.3.4",
    "http://0.0.0.0:3000",
    "http://[::1]:3000",
    "http://[::ffff:127.0.0.1]:3000",
  ])("classifies loopback %s", (raw) => {
    expect(migrationTargetHostKind(raw)).toBe("loopback");
  });

  it.each([
    "http://192.168.1.10:3000",
    "http://10.0.0.8:8443",
    "https://172.16.0.1",
    "http://printer.local",
    "https://app.internal",
  ])("classifies private LAN %s", (raw) => {
    expect(migrationTargetHostKind(raw)).toBe("private");
  });

  it.each(["https://rank.example.com", "https://bisibility.com", "http://203.0.113.10"])(
    "classifies public %s",
    (raw) => {
      expect(migrationTargetHostKind(raw)).toBe("public");
    },
  );

  it.each(["localhost:3000", "not a url", "ftp://localhost", ""])(
    "returns null for unusable %s",
    (raw) => {
      expect(migrationTargetHostKind(raw)).toBeNull();
    },
  );
});

describe("loopbackTunnelCommand", () => {
  it("uses the entered origin", () => {
    expect(loopbackTunnelCommand("http://127.0.0.1:3000")).toBe(
      "cloudflared tunnel --url http://127.0.0.1:3000",
    );
  });

  it("rewrites unspecified IPv4 to localhost", () => {
    expect(loopbackTunnelCommand("http://0.0.0.0:3000")).toBe(
      "cloudflared tunnel --url http://localhost:3000",
    );
  });
});

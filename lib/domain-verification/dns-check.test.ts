import { describe, expect, it, vi } from "vitest";
import { checkDnsProof } from "./dns-check";

describe("DNS domain proof", () => {
  it("looks up the challenge host and joins TXT chunks", async () => {
    const resolver = vi
      .fn()
      .mockResolvedValue([["other"], ["bisibility-site-", "verification=ABC"]]);
    expect(await checkDnsProof("example.com", "ABC", resolver)).toBe("verified");
    expect(resolver).toHaveBeenCalledWith("_bisibility.example.com");
  });
  it("rejects missing and near-matching records", async () => {
    for (const records of [
      [],
      [["bisibility-site-verification=ABCD"]],
      [["x bisibility-site-verification=ABC"]],
    ])
      expect(await checkDnsProof("example.com", "ABC", async () => records)).toBe("missing");
  });
  it("treats absent DNS records as missing", async () => {
    expect(
      await checkDnsProof("example.com", "ABC", async () => {
        throw { code: "ENODATA" };
      }),
    ).toBe("missing");
  });
  it("bounds a hung resolver and redacts resolver errors", async () => {
    expect(await checkDnsProof("example.com", "ABC", () => new Promise(() => {}), 1)).toBe(
      "timeout",
    );
    expect(
      await checkDnsProof("example.com", "ABC", async () => {
        throw new Error("ABC secret");
      }),
    ).toBe("unavailable");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { resolveFounderEmailIdentity } from "./founder-email-identity";

const originalEnvironment = {
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_FOUNDER_FROM: process.env.EMAIL_FOUNDER_FROM,
  EMAIL_FOUNDER_NAME: process.env.EMAIL_FOUNDER_NAME,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("founder email identity", () => {
  it("uses the dedicated configured identity", () => {
    process.env.EMAIL_FROM = "Default <default@example.com>";
    process.env.EMAIL_FOUNDER_FROM = " Ada from bisibility <hello@example.com> ";
    process.env.EMAIL_FOUNDER_NAME = " Ada ";

    expect(resolveFounderEmailIdentity()).toEqual({
      founderName: "Ada",
      from: "Ada from bisibility <hello@example.com>",
      replyTo: "Ada from bisibility <hello@example.com>",
    });
  });

  it("falls back to EMAIL_FROM and generic founder copy", () => {
    process.env.EMAIL_FROM = "bisibility <default@example.com>";
    process.env.EMAIL_FOUNDER_FROM = " ";
    process.env.EMAIL_FOUNDER_NAME = " ";

    expect(resolveFounderEmailIdentity()).toEqual({
      founderName: null,
      from: "bisibility <default@example.com>",
      replyTo: "bisibility <default@example.com>",
    });
  });

  it("uses the founder sender as Reply-To", () => {
    process.env.EMAIL_FROM = "Default <default@example.com>";
    process.env.EMAIL_FOUNDER_FROM = "Welcome <welcome@example.com>";

    expect(resolveFounderEmailIdentity().replyTo).toBe("Welcome <welcome@example.com>");
  });
});

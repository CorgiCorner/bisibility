import { parseProviderInstanceSlug } from "@/lib/instance-setting-definitions";
import { describe, expect, it } from "vitest";
import { buildProviderTag, providerStage } from "./tag";

describe("buildProviderTag", () => {
  it("creates a bounded, delimiter-safe provider tag", () => {
    expect(
      buildProviderTag({
        app: " White label; customer ",
        correlationId: "check:123",
        feature: "rank_check",
        projectId: "project:456",
        source: "app",
        stage: "production",
        trigger: "manual",
      }),
    ).toBe(
      "app=White-label-customer;stage=prod;src=app;trg=manual;f=rank_check;p=project-456;c=check-123",
    );
  });

  it("uses safe fallbacks for unknown deployment stages", () => {
    expect(providerStage("preview")).toBe("dev");
  });

  it("accepts only stable setting values as instance slugs", () => {
    expect(parseProviderInstanceSlug("white_label-1")).toBe("white_label-1");
    expect(parseProviderInstanceSlug("white label")).toBeNull();
  });
});

import { demoNextPath } from "@/lib/demo/demo-next-path";
import { describe, expect, it } from "vitest";

describe("demo next path", () => {
  it.each([
    "/app/prj_example/dashboard",
    "/app/prj_example/keyword-research?seed=ai%20tools%20directory",
    "/app/prj_example/search-console?period=90",
    "/app/prj_example/keyword-research?seed=raw%26value%3D1",
  ])("accepts %s without changing its query", (path) => {
    expect(demoNextPath(path)).toBe(path);
    expect(demoNextPath(demoNextPath(path))).toBe(path);
  });

  it("decodes an encoded path exactly once", () => {
    expect(demoNextPath("%2Fapp%2Fprj_example%2Fdashboard")).toBe("/app/prj_example/dashboard");
  });

  it.each([
    ["/app/prj_example/dashboard", "/app/prj_example/dashboard"],
    [
      "/app/prj_example/keyword-research?seed=raw%26value%3D1",
      "/app/prj_example/keyword-research?seed=raw%26value%3D1",
    ],
    ["%2Fapp%2Fprj_example%2Fdashboard", "/app/prj_example/dashboard"],
    ["/app/prj_other/dashboard", null],
    ["/app/prj_example_suffix/dashboard", null],
    ["/app/prj_example/../prj_other/dashboard", null],
    ["//evil.example.com", null],
  ])("restricts %s to the configured demo project", (path, expected) => {
    expect(demoNextPath(path, "prj_example")).toBe(expected);
  });

  it("accepts exactly 512 characters", () => {
    const path = `/app/${"a".repeat(507)}`;
    expect(path).toHaveLength(512);
    expect(demoNextPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example.com",
    "//evil.example.com",
    "/\\evil.example.com",
    "/app/\\host",
    "/app/..//host",
    "/app/../dashboard",
    "/app/..",
    "/app/%2e%2e/",
    "/app/%2E%2E/",
    "/app/.%2e/",
    "/app/%252e%252e/",
    "/app/%2fhost",
    "/app/%5chost",
    "/app/prj_example/dashboard\u0000",
    "/app/prj_example/dashboard\u001f",
    "/app/prj_example/dashboard\u007f",
    "/app/prj_example/dashboard?seed=%0a",
    "/app/prj_example/dashboard?url=https://evil.example.com",
    "scheme:/app/prj_example/dashboard",
    "/app/prj_example/%",
    "/app/prj_example/%E0%A4%A",
    "/dashboard",
    "/app",
    `/app/${"a".repeat(508)}`,
  ])("rejects unsafe or missing next %j", (raw) => {
    expect(demoNextPath(raw)).toBeNull();
  });
});

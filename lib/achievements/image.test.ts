import { expect, it } from "vitest";
import { badgeImage } from "./image";

it("renders an actual private downloadable PNG without external assets", async () => {
  const response = await badgeImage("presence", "2026-10-16", true);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(10000);
}, 20000);

it("renders the 30-day placeholder without the seven-day artwork", async () => {
  const [thirty, presence] = await Promise.all([
    badgeImage("thirty_days", "2026-12-29", true),
    badgeImage("presence", "2026-12-29"),
  ]);
  expect(thirty.headers.get("Content-Disposition")).toContain("bisibility-thirty_days.png");
  const [thirtyBytes, presenceBytes] = await Promise.all([
    thirty.arrayBuffer(),
    presence.arrayBuffer(),
  ]);
  expect(Array.from(new Uint8Array(thirtyBytes).slice(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(Buffer.from(thirtyBytes)).not.toEqual(Buffer.from(presenceBytes));
}, 20000);

it("reuses deterministic pixels while keeping separate response bodies and download headers", async () => {
  const [a, b] = await Promise.all([
    badgeImage("practice", "2026-10-15"),
    badgeImage("practice", "2026-10-15", true),
  ]);
  expect(a.headers.get("Content-Disposition")).toBeNull();
  expect(b.headers.get("Content-Disposition")).toContain("attachment");
  const [aa, bb] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  expect(Buffer.from(aa)).toEqual(Buffer.from(bb));
}, 20000);

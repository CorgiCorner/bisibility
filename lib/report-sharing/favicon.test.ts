import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { reportCardFavicon } from "./favicon";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("embeds a real favicon from the existing domain icon service", async () => {
  vi.stubEnv("NEXT_PUBLIC_DOMAIN_ICONS", "on");
  const image = await sharp({
    create: { background: "#345678", channels: 4, height: 32, width: 32 },
  })
    .png()
    .toBuffer();
  const location = "https://t3.gstatic.com/faviconV2?size=32";
  const fetchIcon = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { headers: { location }, status: 301 }))
    .mockResolvedValueOnce(
      new Response(new Uint8Array(image), {
        headers: { "content-type": "image/png" },
      }),
    );
  vi.stubGlobal("fetch", fetchIcon);

  expect(await reportCardFavicon("codefa.st")).toBe(
    `data:image/png;base64,${image.toString("base64")}`,
  );
  expect(fetchIcon).toHaveBeenCalledTimes(2);
  expect(fetchIcon.mock.calls[1][0].href).toBe(location);
});

it("uses the fallback for a private domain, disabled icons or an unexpected redirect", async () => {
  vi.stubEnv("NEXT_PUBLIC_DOMAIN_ICONS", "on");
  const fetchIcon = vi.fn().mockResolvedValue(
    new Response(null, {
      headers: { location: "https://example.com/faviconV2" },
      status: 301,
    }),
  );
  vi.stubGlobal("fetch", fetchIcon);

  expect(await reportCardFavicon("project.internal")).toBeUndefined();
  expect(await reportCardFavicon("example.com")).toBeUndefined();
  vi.stubEnv("NEXT_PUBLIC_DOMAIN_ICONS", "off");
  expect(await reportCardFavicon("codefa.st")).toBeUndefined();
  expect(fetchIcon).toHaveBeenCalledTimes(1);
});

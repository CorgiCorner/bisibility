import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { BadgeKind } from "./progress";

let bitmapSource: Promise<string> | undefined;
const rendered = new Map<string, Promise<ArrayBuffer>>();
async function renderBadge(kind: BadgeKind, earnedDay: string) {
  bitmapSource ??= readFile(join(process.cwd(), "public/achievements/badge-characters-clean.png"))
    .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`)
    .catch((error) => {
      bitmapSource = undefined;
      throw error;
    });
  const src = await bitmapSource;
  const response = new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#13251e",
        color: "#f6f5ee",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 300,
          height: 300,
          overflow: "hidden",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: ImageResponse requires a plain image backed by trusted local bytes. */}
        <img
          alt=""
          src={src}
          width={600}
          height={300}
          style={{
            position: "absolute",
            left: kind === "presence" ? 0 : -300,
            top: 0,
            maxWidth: "none",
          }}
        />
      </div>
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
        {kind === "presence" ? "7 days showing up" : "7 days of SEO practice"}
      </div>
      <div style={{ display: "flex", fontSize: 20, marginTop: 16, color: "#acc6b8" }}>
        bisibility · {earnedDay}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
  return response.arrayBuffer();
}

export async function badgeImage(kind: BadgeKind, earnedDay: string, download = false) {
  const key = `${kind}:${earnedDay}`;
  let bytes = rendered.get(key);
  if (!bytes) {
    bytes = renderBadge(kind, earnedDay).catch((error) => {
      rendered.delete(key);
      throw error;
    });
    rendered.set(key, bytes);
    if (rendered.size > 32) rendered.delete(rendered.keys().next().value as string);
  } else {
    rendered.delete(key);
    rendered.set(key, bytes);
  }
  return new Response((await bytes).slice(0), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...(download
        ? { "Content-Disposition": `attachment; filename="bisibility-${kind}.png"` }
        : {}),
    },
  });
}

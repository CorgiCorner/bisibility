import { OpenGraphBrandLockup } from "@/lib/seo/og-brand-lockup";
import { LICENSE } from "@/lib/site/site";
import { ImageResponse } from "next/og";

export const alt = "bisibility SEO observability for developers";
export const contentType = "image/png";
export const runtime = "edge";
export const size = {
  height: 630,
  width: 1200,
};

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f2eee4",
        color: "#1a1813",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          border: "2px solid #d9d4c7",
          borderRadius: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "34px",
          height: "100%",
          justifyContent: "space-between",
          padding: "52px",
          width: "100%",
        }}
      >
        <OpenGraphBrandLockup />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: 0,
            lineHeight: 1.04,
            maxWidth: 920,
          }}
        >
          Know where you rank.
          <br />
          See what changed.
        </div>

        <div
          style={{
            alignItems: "center",
            color: "#6b6657",
            display: "flex",
            fontSize: 26,
            gap: "18px",
          }}
        >
          <span>{LICENSE}</span>
          <span style={{ color: "#d97757" }}>|</span>
          <span>Signals timeline</span>
          <span style={{ color: "#d97757" }}>|</span>
          <span>BYO SERP provider</span>
        </div>
      </div>
    </div>,
    size,
  );
}

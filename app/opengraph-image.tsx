import { OpenGraphBrandLockup } from "@/lib/seo/og-brand-lockup";
import { ImageResponse } from "next/og";

export const alt = "Open-source SEO platform";
export const contentType = "image/png";
export const runtime = "edge";
export const size = {
  height: 630,
  width: 1200,
};

const MUTED = "#6b6657";
const PHRASE_ROW = {
  alignItems: "center",
  color: MUTED,
  display: "flex",
  fontSize: 26,
  gap: 12,
  whiteSpace: "nowrap",
} as const;

function PhraseRow({ items }: Readonly<{ items: readonly string[] }>) {
  return (
    <div style={PHRASE_ROW}>
      {items.flatMap((item, index) =>
        index === 0
          ? [
              <span key={item} style={{ display: "flex" }}>
                {item}
              </span>,
            ]
          : [
              <span key={`${item}-dot`} style={{ display: "flex" }}>
                ·
              </span>,
              <span key={item} style={{ display: "flex" }}>
                {item}
              </span>,
            ],
      )}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#fcf7ed",
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
          border: "2px solid #ddd8cc",
          borderRadius: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "28px",
          height: "100%",
          justifyContent: "space-between",
          padding: "52px",
          width: "100%",
        }}
      >
        <OpenGraphBrandLockup />

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: 1000 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: 0,
              lineHeight: 1.04,
              whiteSpace: "nowrap",
            }}
          >
            Open-source SEO platform
          </div>

          <PhraseRow items={["Track rankings", "Research keywords", "Inspect backlinks"]} />
        </div>

        <PhraseRow items={["Self-host or free beta", "Pay only for SERP checks", "MCP-ready"]} />
      </div>
    </div>,
    size,
  );
}

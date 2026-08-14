import { OpenGraphBrandLockup } from "@/lib/seo/og-brand-lockup";
import { LICENSE } from "@/lib/site/site";
import { ImageResponse } from "next/og";

export const alt = "Open-source observability for your rankings";
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
            fontSize: 68,
            fontWeight: 800,
            letterSpacing: 0,
            lineHeight: 1.04,
            maxWidth: 1000,
            whiteSpace: "nowrap",
          }}
        >
          Open-source observability
          <br />
          for your rankings.
        </div>

        <div
          style={{
            alignItems: "center",
            color: "#6b6657",
            display: "flex",
            fontSize: 23,
            gap: "14px",
            whiteSpace: "nowrap",
          }}
        >
          <span>{LICENSE}</span>
          <span style={{ color: "#d97757" }}>|</span>
          <span>MCP server + SDKs + CLI</span>
          <span style={{ color: "#d97757" }}>|</span>
          <span>Agent-ready</span>
        </div>
      </div>
    </div>,
    size,
  );
}

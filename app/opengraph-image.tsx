import { OpenGraphBrandLockup } from "@/lib/seo/og-brand-lockup";
import { defaultSocialImage } from "@/lib/seo/page-metadata";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { ImageResponse } from "next/og";

export const alt = defaultSocialImage.alt;
export const contentType = "image/png";
export const runtime = "nodejs";
export const size = {
  height: defaultSocialImage.height,
  width: defaultSocialImage.width,
};

const MUTED = "#585858";
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
        background: "#f5f5f5",
        color: "#202020",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          border: "2px solid #d6d6d6",
          borderRadius: UI_RADIUS_ROLES.card,
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
          <div style={{ color: MUTED, display: "flex", fontSize: 30 }}>
            Rank tracking and AI visibility for your sites.
          </div>
        </div>

        <PhraseRow items={["Self-host free", "Your own provider keys", "MCP-ready"]} />
      </div>
    </div>,
    size,
  );
}

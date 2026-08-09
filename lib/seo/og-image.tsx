import { OpenGraphBrandLockup } from "@/lib/seo/og-brand-lockup";
import { LICENSE } from "@/lib/site/site";
import { ImageResponse } from "next/og";

export const ogImageSize = {
  height: 630,
  width: 1200,
};

type ContentOpenGraphImage = {
  label: string;
  title: string;
  description?: string;
};

function titleSize(title: string) {
  if (title.length > 92) {
    return 52;
  }
  if (title.length > 68) {
    return 58;
  }
  return 66;
}

export function createContentOpenGraphImage({ description, label, title }: ContentOpenGraphImage) {
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
          gap: "30px",
          height: "100%",
          justifyContent: "space-between",
          padding: "52px",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <OpenGraphBrandLockup />
          <div
            style={{
              background: "#fff8ee",
              border: "2px solid #d9d4c7",
              borderRadius: "999px",
              color: "#d97757",
              display: "flex",
              fontSize: 22,
              fontWeight: 800,
              padding: "12px 22px",
            }}
          >
            {label}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: 940 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: titleSize(title),
              fontWeight: 800,
              letterSpacing: 0,
              lineHeight: 1.06,
              wordBreak: "break-word",
            }}
          >
            {title}
          </div>
          {description ? (
            <div style={{ color: "#6b6657", fontSize: 28, lineHeight: 1.35, maxWidth: 850 }}>
              {description}
            </div>
          ) : null}
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
    ogImageSize,
  );
}

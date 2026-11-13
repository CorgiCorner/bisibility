import "server-only";

import { BRAND_MARK_VIEW_BOX_SIZE, BRAND_WORDMARK, brandMarkPath } from "@/lib/ui/brand";
import { ImageResponse } from "next/og";
import type { ShareImageCopy } from "./image-facts";

const themes = {
  dark: {
    bg: "#171719",
    panel: "#222225",
    border: "#39393d",
    fg: "#faf9f6",
    muted: "#b5b5be",
    accent: "#b6e889",
    chip: "#343b2d",
  },
  light: {
    bg: "#f3f2ef",
    panel: "#ffffff",
    border: "#e3e2dd",
    fg: "#1a1a1d",
    muted: "#585963",
    accent: "#3b6330",
    chip: "#e8f0e2",
  },
} as const;

type CardTheme = (typeof themes)[keyof typeof themes];

function ClickBars({ points, theme }: { points: (number | null)[]; theme: CardTheme }) {
  const max = Math.max(1, ...points.map((point) => point ?? 0));
  return (
    <div
      style={{
        alignItems: "flex-end",
        borderBottom: `1px solid ${theme.border}`,
        display: "flex",
        gap: points.length > 45 ? 2 : 4,
        height: 94,
      }}
    >
      {points.map((point, index) => (
        <div
          key={index}
          style={{
            background: point === null ? "transparent" : theme.accent,
            borderRadius: 3,
            flex: 1,
            height: point === null ? 0 : Math.max(2, Math.round((point / max) * 88)),
          }}
        />
      ))}
    </div>
  );
}

export async function shareReportImage(input: {
  copy: ShareImageCopy;
  domain: string;
  download?: boolean;
  favicon?: string;
  labels: {
    comparison?: { start: string; latest: string; change: string };
    clickTrend?: string;
    day: string;
    detail?: string;
    facts: Record<string, string>;
    headline: string;
  };
  theme: "dark" | "light";
  title: string;
}) {
  const theme = themes[input.theme];
  const { comparison, clickTrend, facts, headline } = input.copy;
  const showTrend = clickTrend && clickTrend.filter((point) => point !== null).length > 1;
  const response = new ImageResponse(
    <div
      style={{
        background: theme.bg,
        color: theme.fg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        height: "100%",
        padding: 40,
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 15 }}>
          <div
            style={{
              alignItems: "center",
              background: theme.chip,
              borderRadius: 13,
              color: theme.accent,
              display: "flex",
              fontSize: 29,
              fontWeight: 700,
              height: 56,
              justifyContent: "center",
              width: 56,
            }}
          >
            {input.favicon ? (
              // biome-ignore lint/performance/noImgElement: next/og rasterizes the embedded PNG.
              <img alt="" height={32} src={input.favicon} width={32} />
            ) : (
              (input.domain.trim()[0] ?? "?").toUpperCase()
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", fontSize: 29, fontWeight: 700 }}>
              {input.domain.slice(0, 40)}
            </div>
            <div style={{ color: theme.muted, display: "flex", fontSize: 19 }}>
              {input.labels.day}
            </div>
          </div>
        </div>
        <div
          style={{ alignItems: "center", display: "flex", fontSize: 26, fontWeight: 800, gap: 9 }}
        >
          <svg
            height={31}
            viewBox={`0 0 ${BRAND_MARK_VIEW_BOX_SIZE} ${BRAND_MARK_VIEW_BOX_SIZE}`}
            width={31}
          >
            <path d={brandMarkPath(31)} fill={theme.fg} fillRule="evenodd" />
          </svg>
          {BRAND_WORDMARK}
        </div>
      </div>
      <div
        style={{
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 24,
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "31px 34px",
        }}
      >
        <div style={{ color: theme.muted, display: "flex", fontSize: 24, fontWeight: 600 }}>
          {input.title.length > 85 ? `${input.title.slice(0, 84)}…` : input.title}
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flex: 1,
            gap: 36,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 8 }}>
            {input.labels.headline && (
              <div style={{ display: "flex", fontSize: 31, fontWeight: 700, lineHeight: 1.15 }}>
                {input.labels.headline}
              </div>
            )}
            {comparison && input.labels.comparison ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <div style={{ alignItems: "flex-start", display: "flex", gap: 29 }}>
                  {[
                    { label: input.labels.comparison.start, value: comparison.start },
                    { label: input.labels.comparison.latest, value: comparison.latest },
                  ].map((stat, index) => (
                    <div key={stat.label} style={{ display: "flex", gap: 29 }}>
                      {index === 1 && (
                        <div
                          style={{
                            color: theme.muted,
                            display: "flex",
                            fontSize: 39,
                            paddingTop: 15,
                          }}
                        >
                          →
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", fontSize: 66, fontWeight: 750 }}>
                          {stat.value}
                        </div>
                        <div style={{ color: theme.muted, display: "flex", fontSize: 22 }}>
                          {stat.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ color: theme.muted, display: "flex", fontSize: 22 }}>
                  {input.labels.comparison.change}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  fontSize: headline.length > 9 ? 58 : 104,
                  fontWeight: 800,
                  letterSpacing: -3,
                  lineHeight: 1.05,
                }}
              >
                {headline}
              </div>
            )}
            {input.labels.detail && (
              <div style={{ color: theme.muted, display: "flex", fontSize: 22 }}>
                {input.labels.detail}
              </div>
            )}
          </div>
          {showTrend && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 405 }}>
              <ClickBars points={clickTrend} theme={theme} />
              <div style={{ color: theme.muted, display: "flex", fontSize: 19 }}>
                {input.labels.clickTrend}
              </div>
            </div>
          )}
        </div>
        {facts.length > 0 && (
          <div
            style={{
              borderTop: `1px solid ${theme.border}`,
              display: "flex",
              gap: 25,
              paddingTop: 19,
            }}
          >
            {facts.map((fact) => (
              <div
                key={fact.label}
                style={{ display: "flex", flex: 1, flexDirection: "column", gap: 4 }}
              >
                <div style={{ display: "flex", fontSize: 35, fontWeight: 750 }}>{fact.value}</div>
                <div style={{ color: theme.muted, display: "flex", fontSize: 20 }}>
                  {input.labels.facts[fact.label] ?? fact.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    { height: 630, width: 1200 },
  );
  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "image/png",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...(input.download
        ? { "Content-Disposition": 'attachment; filename="bisibility-report.png"' }
        : {}),
    },
  });
}

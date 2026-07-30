import "server-only";

import type { WeeklyDigestData } from "./weekly-digest-data";

export type WeeklyDigestEmail = {
  html: string;
  subject: string;
  text: string;
};

function escapeHtml(value: string) {
  // This is complete HTML text-node escaping; keep it local to avoid emitting raw untrusted markup.
  // nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function positionLabel(position: number | null) {
  return position === null ? "No rank" : `#${position}`;
}

function deltaLabel(delta: number) {
  const value = Number.isInteger(delta) ? String(delta) : delta.toFixed(1);
  return delta > 0 ? `+${value}` : value;
}

function averageLabel(delta: number | null) {
  return delta === null ? "No comparable history" : deltaLabel(delta);
}

function moverText(mover: WeeklyDigestData["topMovers"][number]) {
  return `${mover.keyword}: ${positionLabel(mover.from)} -> ${positionLabel(mover.to)} (${deltaLabel(mover.delta)})`;
}

function moversHtml(data: WeeklyDigestData) {
  if (data.topMovers.length === 0) {
    return "<p>No comparable keyword movement this week.</p>";
  }

  const items = data.topMovers.map((mover) => `<li>${escapeHtml(moverText(mover))}</li>`).join("");
  return `<p><strong>Top movers</strong></p><ul style="margin:0 0 16px 20px;padding:0;">${items}</ul>`;
}

function moversText(data: WeeklyDigestData) {
  if (data.topMovers.length === 0) {
    return "Top movers\nNo comparable keyword movement this week.";
  }

  return ["Top movers", ...data.topMovers.map((mover) => `- ${moverText(mover)}`)].join("\n");
}

export function renderWeeklyDigestEmail(data: WeeklyDigestData): WeeklyDigestEmail {
  const range = `${dateLabel(data.rangeStart)} to ${dateLabel(data.rangeEnd)}`;
  const summary = `Average delta: ${averageLabel(data.avgPositionDelta)}. Checked keywords: ${data.checkedKeywords}. Failed checks: ${data.failedChecksCount}.`;

  return {
    html: [
      `<p><strong>Weekly rank report for ${escapeHtml(data.projectName)}</strong></p>`,
      `<p>${escapeHtml(data.projectDomain)} - ${escapeHtml(range)}</p>`,
      `<p>${escapeHtml(summary)}</p>`,
      moversHtml(data),
    ].join(""),
    subject: `Weekly rank report - ${data.projectName}`,
    text: [
      `Weekly rank report for ${data.projectName}`,
      `${data.projectDomain} - ${range}`,
      summary,
      "",
      moversText(data),
    ].join("\n"),
  };
}

import { BRAND_WORDMARK, brandLockupScale } from "@/lib/ui/brand";
import { escapeHtml } from "./escape-html";

export function brandedEmailHtml(html: string, origin: string) {
  const appOrigin = new URL(origin);
  if (!["https:", "http:"].includes(appOrigin.protocol))
    throw new Error("Email branding requires an HTTP application origin.");
  const e = escapeHtml;
  const scale = brandLockupScale("md", "horizontal");
  const logo = `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td style="vertical-align:middle;padding-right:12px"><img src="${e(appOrigin.origin)}/bisibility-icon-400.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:8px"></td><td style="vertical-align:middle;font-size:${scale.type}px;font-weight:700;letter-spacing:-0.045em;color:#1a1813">${e(BRAND_WORDMARK)}</td></tr><tr><td colspan="2" height="24" style="height:24px;line-height:24px;font-size:0">&nbsp;</td></tr></table>`;
  const content = html.replace(/^<p>/, '<p style="margin:0 0 14px">');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${logo}${content}</body></html>`;
}

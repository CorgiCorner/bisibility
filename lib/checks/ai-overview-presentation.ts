type Item = { title?: string | null; rawFragment?: unknown };
const object = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
export function aiOverviewPresentation(items: readonly Item[]) {
  const paragraphs: string[] = [];
  const sections: { heading?: string; text: string; markdown?: string }[] = [];
  const sources: { title: string; url: string }[] = [];
  const text = (v: unknown) => {
    if (typeof v === "string" && v.trim() && !paragraphs.includes(v.trim()))
      paragraphs.push(v.trim().slice(0, 3000));
  };
  function visit(value: unknown, depth = 0) {
    if (depth > 4) return;
    const row = object(value);
    if (!row) return;
    for (const key of ["title", "text", "snippet"]) text(row[key]);
    for (const key of ["items", "text_blocks"])
      if (Array.isArray(row[key]))
        (row[key] as unknown[]).slice(0, 30).forEach((x) => {
          visit(x, depth + 1);
        });
    for (const key of ["references", "sources"])
      if (Array.isArray(row[key]))
        for (const source of (row[key] as unknown[]).slice(0, 20)) {
          const s = object(source);
          const href = s?.link ?? s?.url;
          if (typeof href !== "string") continue;
          try {
            const u = new URL(href);
            if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) continue;
            if (!sources.some((x) => x.url === u.href))
              sources.push({
                url: u.href,
                title: typeof s?.title === "string" ? s.title : u.hostname,
              });
          } catch {}
        }
  }
  for (const item of items) {
    text(item.title);
    visit(item.rawFragment);
    const raw = object(item.rawFragment);
    if (Array.isArray(raw?.items))
      for (const value of raw.items.slice(0, 30)) {
        const row = object(value);
        const body = row?.text ?? row?.snippet;
        if (typeof body !== "string" || !body.trim()) continue;
        sections.push({
          ...(typeof row?.title === "string" && row.title.trim()
            ? { heading: row.title.trim() }
            : {}),
          text: body.slice(0, 10000),
          ...(typeof row?.markdown === "string" ? { markdown: row.markdown.slice(0, 20000) } : {}),
        });
      }
  }
  return {
    paragraphs: paragraphs.slice(0, 20),
    sources: sources.slice(0, 20),
    ...(sections.length ? { sections } : {}),
  };
}

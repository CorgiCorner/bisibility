"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import type { ReactNode } from "react";

/** Treat all source as text. Only explicitly recognized HTTP(S) links become elements. */
function inline(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(!?\[[^\]\n]*\]\([^\s)]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    nodes.push(source.slice(offset, index));
    const token = match[0];
    const key = `${index}-${token}`;
    if (token.startsWith("![")) nodes.push(token);
    else if (token.startsWith("[")) {
      const link = /^\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      let safe = false;
      try {
        safe = Boolean(link && ["http:", "https:"].includes(new URL(link[2]).protocol));
      } catch {
        /* Render invalid URLs as text. */
      }
      nodes.push(
        safe && link ? (
          <a
            className="break-all text-accent-text underline"
            href={link[2]}
            key={key}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link[1]} <span aria-hidden>↗</span>
          </a>
        ) : (
          token
        ),
      );
    } else if (token.startsWith("`"))
      nodes.push(
        <code className="rounded bg-bg-sunken px-1" key={key}>
          {token.slice(1, -1)}
        </code>,
      );
    else if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    offset = index + token.length;
  }
  nodes.push(source.slice(offset));
  return nodes;
}

export function SafeMarkdown({ text }: Readonly<{ text: string }>) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const start = i;
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(line)) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      const value = code.join("\n");
      blocks.push(
        <div className="relative rounded-control bg-bg-sunken" key={start}>
          <CopyButton className="absolute right-1 top-1" text={value} />
          <pre className="overflow-x-auto p-3 pr-10 text-xs">
            <code>{value}</code>
          </pre>
        </div>,
      );
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const table = [lines[i++], lines[i++]];
      while (i < lines.length && lines[i].includes("|")) table.push(lines[i++]);
      blocks.push(
        <pre className="overflow-x-auto rounded-control bg-bg-sunken p-3 text-xs" key={start}>
          {table.join("\n")}
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inline(heading[2]);
      // Answer headings nest below the panel's h2, so Markdown levels start at h3.
      const Tag = (["h3", "h4", "h5", "h6", "h6", "h6"] as const)[heading[1].length - 1];
      blocks.push(
        <Tag className="font-semibold" key={start}>
          {content}
        </Tag>,
      );
      i++;
      continue;
    }
    const list = /^\s*([-+*]|\d+\.)\s+(.+)$/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = /^\s*([-+*]|\d+\.)\s+(.+)$/.exec(lines[i]);
        if (!item || /\d/.test(item[1]) !== ordered) break;
        items.push(<li key={i}>{inline(item[2])}</li>);
        i++;
      }
      blocks.push(
        ordered ? (
          <ol className="list-decimal pl-5" key={start}>
            {items}
          </ol>
        ) : (
          <ul className="list-disc pl-5" key={start}>
            {items}
          </ul>
        ),
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]))
        quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote className="rounded-control bg-bg-sunken p-2 text-fg-muted" key={start}>
          {inline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }
    const paragraph = [lines[i++]];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(?:```|#{1,6}\s|>|[-+*]\s|\d+\.\s)/.test(lines[i])
    )
      paragraph.push(lines[i++]);
    blocks.push(
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" key={start}>
        {inline(paragraph.join("\n"))}
      </p>,
    );
  }
  return <div className="space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]">{blocks}</div>;
}

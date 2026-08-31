import { Fragment } from "react";

type CodeTone = "accent" | "keyword" | "string";

type CodeToken = {
  offset: number;
  text: string;
  tone?: CodeTone;
  type?: "url";
};

const toneColor = {
  accent: "var(--accent)",
  keyword: "var(--blue)",
  string: "var(--green)",
} as const;

const shellTokenPattern =
  /https?:\/\/[^\s"'\\}\]]+|\$[A-Z_][A-Z0-9_]*|--?[A-Za-z][A-Za-z0-9-]*|"[^"\n]*"|'[^'\n]*'|\b(?:claude|codex|curl)\b/g;
const quotedValuePattern = /https?:\/\/[^\s"'\\}\]]+|\$[A-Z_][A-Z0-9_]*/g;

function splitQuotedToken(text: string, offset: number, key: boolean): CodeToken[] {
  if (key) return [{ offset, text, tone: "keyword" }];

  const tokens: CodeToken[] = [];
  let last = 0;
  for (const match of text.matchAll(quotedValuePattern)) {
    if (match.index > last) {
      tokens.push({ offset: offset + last, text: text.slice(last, match.index), tone: "string" });
    }
    const matchedText = match[0];
    tokens.push({
      offset: offset + match.index,
      text: matchedText,
      tone: matchedText.startsWith("$") ? "accent" : undefined,
      type: matchedText.startsWith("http") ? "url" : undefined,
    });
    last = match.index + matchedText.length;
  }
  if (last < text.length) {
    tokens.push({ offset: offset + last, text: text.slice(last), tone: "string" });
  }
  return tokens;
}

export function tokenizeInstallCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let last = 0;
  for (const match of code.matchAll(shellTokenPattern)) {
    if (match.index > last) tokens.push({ offset: last, text: code.slice(last, match.index) });

    const text = match[0];
    if (text.startsWith('"') || text.startsWith("'")) {
      const following = code.slice(match.index + text.length);
      tokens.push(...splitQuotedToken(text, match.index, /^\s*:/.test(following)));
    } else if (text.startsWith("http")) {
      tokens.push({ offset: match.index, text, type: "url" });
    } else if (text.startsWith("$")) {
      tokens.push({ offset: match.index, text, tone: "accent" });
    } else {
      tokens.push({ offset: match.index, text, tone: "keyword" });
    }
    last = match.index + text.length;
  }
  if (last < code.length) tokens.push({ offset: last, text: code.slice(last) });
  return tokens.length > 0 ? tokens : [{ offset: 0, text: code }];
}

export function HighlightedInstallCode({ code }: Readonly<{ code: string }>) {
  return tokenizeInstallCode(code).map((token) => {
    const key = `${token.offset}:${token.text}`;
    if (token.tone) {
      return (
        <span key={key} style={{ color: toneColor[token.tone] }}>
          {token.text}
        </span>
      );
    }
    return <Fragment key={key}>{token.text}</Fragment>;
  });
}

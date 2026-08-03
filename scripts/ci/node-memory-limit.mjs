#!/usr/bin/env node
import { fileURLToPath } from "node:url";

export const pinnedNodeOptions = "--max-old-space-size=4096";
const heapOptionPattern = /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+(?=\s|$)/g;

export function applyPinnedNodeOptions(current = "") {
  const withoutHeapLimit = current.replace(heapOptionPattern, " ").trim().replace(/\s+/g, " ");
  return [withoutHeapLimit, pinnedNodeOptions].filter(Boolean).join(" ");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argument = process.argv[2];
  if (argument && argument !== "--merge") {
    throw new Error(`Unknown argument: ${argument}`);
  }
  console.log(argument === "--merge" ? applyPinnedNodeOptions(process.env.NODE_OPTIONS) : pinnedNodeOptions);
}

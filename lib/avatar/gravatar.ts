import "server-only";

import { createHash } from "node:crypto";

export function gravatarUrl(email: string, renderedSize: number): string {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const size = renderedSize * 2;
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}

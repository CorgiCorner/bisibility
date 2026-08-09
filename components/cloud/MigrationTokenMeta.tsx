"use client";

import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { expiresInLabel } from "./cloud-token";

export function metaFor(
  token: ActiveMigrationToken | IssuedMigrationToken,
  workspaceName: string,
): string[] {
  const createdBy = "createdBy" in token ? token.createdBy.email : "you";

  return [
    expiresInLabel(token.expiresAt),
    token.singleUse ? "Single-use" : "Reusable",
    `Scope ${token.scope}`,
    workspaceName,
    `Created by ${createdBy}`,
  ];
}

export function TokenMeta({
  token,
  workspaceName,
}: Readonly<{
  token: ActiveMigrationToken | IssuedMigrationToken;
  workspaceName: string;
}>) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-[11px] gap-y-2 font-mono text-[11px] text-fg-muted">
      {metaFor(token, workspaceName).map((item, index) => (
        <span className="inline-flex items-center gap-x-[11px]" key={item}>
          {index > 0 ? <span className="h-2.5 w-px bg-border-strong" /> : null}
          {item}
        </span>
      ))}
    </div>
  );
}

"use client";

export function permissionLabel(permissionLevel: string) {
  if (permissionLevel === "siteOwner") return "Owner";
  if (permissionLevel === "siteFullUser") return "Full user";
  if (permissionLevel === "siteRestrictedUser") return "Restricted user";
  return permissionLevel;
}

export function GoogleScopes({
  granted,
  scopes,
}: Readonly<{ granted: boolean; scopes: readonly string[] }>) {
  return (
    <div className="font-mono text-[10.5px] leading-[1.6] text-fg-muted">
      <span className="block">Access {granted ? "granted" : "requested"}:</span>
      {scopes.map((scope) => (
        <span className="block" key={scope}>
          · {scope}
        </span>
      ))}
    </div>
  );
}

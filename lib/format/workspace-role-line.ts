export const workspaceRoleValues = ["owner", "admin", "member", "auditor", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoleValues)[number];

export type WorkspaceRoleLineMessages = {
  inProject: (values: { project: string; role: string }) => string;
  roles: Record<WorkspaceRole, string>;
};

/** Joins stable role data to the localized shell sentence without changing stored project names. */
export function workspaceRoleLine(
  role: WorkspaceRole,
  name: string,
  domain: string,
  messages: WorkspaceRoleLineMessages,
) {
  const suffix = domain.trim() ? ` - ${domain.trim()}` : "";
  const projectName =
    suffix && name.toLowerCase().endsWith(suffix.toLowerCase())
      ? name.slice(0, -suffix.length).trimEnd()
      : name;
  return messages.inProject({ project: projectName, role: messages.roles[role] });
}

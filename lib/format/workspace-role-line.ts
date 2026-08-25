export function workspaceRoleLine(role: string, name: string, domain = "") {
  const titled = `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  const suffix = domain.trim() ? ` - ${domain.trim()}` : "";
  const projectName =
    suffix && name.toLowerCase().endsWith(suffix.toLowerCase())
      ? name.slice(0, -suffix.length).trimEnd()
      : name;
  return `${titled} in ${projectName}`;
}

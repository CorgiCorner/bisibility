import "server-only";

export async function readDeploymentMeteringPreflightAuthority(
  _connectionId: string,
): Promise<"legacy" | "active" | "draining"> {
  return "legacy";
}

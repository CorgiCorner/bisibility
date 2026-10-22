import "server-only";

/** Self-hosted instances have no deployment wallet or subscription authority. */
export async function readDeploymentFirstCheckSourceReady(
  _projectId: string,
  _connection: unknown,
  ownKeyReady: boolean,
  _now: Date,
): Promise<boolean> {
  return ownKeyReady;
}

/** Self-host builds have no deployment-specific provider-spend classifications. */
export const deploymentFreeOperationProviderSpend: Readonly<
  Record<string, { handler: string; kind: "free" }>
> = {};

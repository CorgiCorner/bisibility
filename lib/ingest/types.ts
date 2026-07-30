export type DeployEvent = {
  deploymentId?: string;
  environment?: string;
  paths?: string[];
  provider: string;
  url?: string;
};

export type DeploySignalPayload = {
  deploymentId?: string;
  environment?: string;
  paths?: string[];
  provider: string;
  test?: true;
};

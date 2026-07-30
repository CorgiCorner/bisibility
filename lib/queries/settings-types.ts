export type NewWorkspaceSettings = {
  devKey: {
    createdLabel: string;
    id: string;
    isNew: boolean;
    maskedValue: string;
    name: string;
  } | null;
  memberCount: number;
  owner: { email: string; initials: string; name: string };
  workspace: { domain: string; name: string; projectId: string };
};

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

type Ref = (name: string) => object;
type List = (schema: object) => object;

export function resourcePaths(input: { bearer: Bearer; list: List; ref: Ref }) {
  const { bearer, list, ref } = input;
  return {
    "/alert-rules/{rule_id}": {
      delete: bearer("Delete an alert rule", "deleteAlertRule", ref("AlertRule")),
      patch: bearer(
        "Update an alert rule",
        "updateAlertRule",
        ref("AlertRule"),
        ref("AlertRuleInput"),
      ),
    },
    "/competitors/{competitor_id}": {
      delete: bearer("Remove a competitor", "removeCompetitor", ref("Competitor")),
    },
    "/migration-tokens/{token_id}": {
      delete: bearer("Revoke a migration token", "revokeMigrationToken", ref("MigrationToken")),
    },
    "/projects/{project_id}/alert-rules": {
      get: bearer("List alert rules", "listAlertRules", list(ref("AlertRule"))),
      post: bearer(
        "Create an alert rule",
        "createAlertRule",
        ref("AlertRule"),
        ref("AlertRuleInput"),
      ),
    },
    "/projects/{project_id}/competitors": {
      get: bearer("List competitors", "listCompetitors", list(ref("Competitor"))),
      post: bearer("Add a competitor", "addCompetitor", ref("Competitor"), ref("CompetitorCreate")),
    },
    "/projects/{project_id}/competitors/{competitor_id}": {
      delete: bearer("Remove a competitor", "removeProjectCompetitor", ref("Competitor")),
    },
    "/projects/{project_id}/migration-tokens": {
      get: bearer("List migration tokens", "listMigrationTokens", list(ref("MigrationToken"))),
      post: bearer("Mint a migration token", "mintMigrationToken", ref("MigrationToken")),
    },
    "/projects/{project_id}/migration-tokens/{token_id}": {
      delete: bearer(
        "Revoke a migration token",
        "revokeProjectMigrationToken",
        ref("MigrationToken"),
      ),
    },
    "/projects/{project_id}/notification-preferences": {
      get: bearer(
        "Get notification preferences",
        "getNotificationPreferences",
        ref("NotificationPreferences"),
      ),
      patch: bearer(
        "Update notification preferences",
        "updateNotificationPreferences",
        ref("NotificationPreferences"),
        ref("NotificationPreferences"),
      ),
    },
    "/projects/{project_id}/providers": {
      get: bearer("List providers", "listProviders", list(ref("Provider"))),
    },
    "/projects/{project_id}/providers/{provider_id}": {
      delete: bearer("Disconnect a provider", "disconnectProvider", ref("Provider")),
      patch: bearer(
        "Update provider settings",
        "updateProviderSettings",
        ref("Provider"),
        ref("ProviderConnect"),
      ),
    },
    "/projects/{project_id}/providers/{provider_id}/connect": {
      post: bearer(
        "Connect a provider",
        "connectProvider",
        ref("Provider"),
        ref("ProviderConnect"),
      ),
    },
    "/projects/{project_id}/providers/{provider_id}/test": {
      post: bearer(
        "Test a provider connection",
        "testProviderConnection",
        ref("ProviderTestResult"),
        ref("ProviderConnect"),
      ),
    },
    "/projects/{project_id}/saved-views/{view_id}": {
      delete: bearer("Delete a saved view", "deleteProjectSavedView", ref("SavedView")),
    },
    "/projects/{project_id}/team/invites": {
      get: bearer("List team invites", "listTeamInvites", list(ref("TeamInvite"))),
      post: bearer(
        "Create a team invite",
        "createTeamInvite",
        ref("TeamInvite"),
        ref("TeamInviteCreate"),
      ),
    },
    "/projects/{project_id}/team/invites/{invite_id}": {
      delete: bearer("Revoke a team invite", "revokeProjectTeamInvite", ref("TeamInvite")),
    },
    "/projects/{project_id}/team/members": {
      get: bearer("List team members", "listTeamMembers", list(ref("TeamMember"))),
    },
    "/projects/{project_id}/triggered-alerts": {
      get: bearer("List triggered alerts", "listTriggeredAlerts", list(ref("TriggeredAlert"))),
    },
    "/saved-views/{view_id}": {
      delete: bearer("Delete a saved view", "deleteSavedView", ref("SavedView")),
    },
    "/team/invites/{invite_id}": {
      delete: bearer("Revoke a team invite", "revokeTeamInvite", ref("TeamInvite")),
    },
  };
}

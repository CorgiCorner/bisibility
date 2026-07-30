import type { schemas } from "./openapi-components";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

export function teamMutationPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/team/invites/{invite_id}/resend": {
      post: input.bearer(
        "Resend a pending team invite",
        "resendTeamInvite",
        input.ref("TeamInviteResendResult"),
      ),
    },
    "/projects/{project_id}/team/members/{member_id}": {
      delete: input.bearer(
        "Remove a non-owner team member",
        "removeTeamMember",
        input.ref("TeamMemberMutationResult"),
      ),
      patch: input.bearer(
        "Change a non-owner team member role",
        "updateTeamMemberRole",
        input.ref("TeamMemberRoleResult"),
        input.ref("TeamMemberRolePatch"),
      ),
    },
  };
}

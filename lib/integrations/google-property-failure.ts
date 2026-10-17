export type GooglePropertyFailureReason =
  | "auth"
  | "scope"
  | "permission"
  | "configuration"
  | "api_disabled"
  | "quota"
  | "temporary"
  | "unknown";
export type GooglePropertyFailure = {
  reason: GooglePropertyFailureReason;
  action:
    | "reconnect"
    | "reauthorize"
    | "check_permissions"
    | "configure_api"
    | "retry_later"
    | "retry";
  httpStatus?: number;
  code?: string;
};
const messageKeys = {
  auth: "googlePropertyAuth",
  scope: "googlePropertyScope",
  permission: "googlePropertyPermission",
  api_disabled: "googlePropertyApiDisabled",
  configuration: "googlePropertyApiDisabled",
  quota: "googlePropertyQuota",
  temporary: "googlePropertyTemporary",
  unknown: "googlePropertyUnknown",
} as const;
export function googlePropertyFailureMessage(
  failure: GooglePropertyFailure,
  translate: (key: (typeof messageKeys)[GooglePropertyFailureReason]) => string,
) {
  return translate(messageKeys[failure.reason]);
}

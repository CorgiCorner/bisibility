type DemoIdentity = {
  id: string;
  deactivatedAt: unknown;
  emailVerified: boolean;
  isInstanceAdmin: boolean;
  role: string;
  twoFactorEnabled: boolean | null;
  memberships: { role: string; project: { ownerId?: string; publicId: string } }[];
};

export function demoIdentityAllowed(user: DemoIdentity | null, projectPublicId: string) {
  return Boolean(
    user &&
      user.deactivatedAt === null &&
      user.emailVerified &&
      !user.isInstanceAdmin &&
      !user.twoFactorEnabled &&
      user.role === "viewer" &&
      user.memberships.length === 1 &&
      user.memberships[0]?.role === "viewer" &&
      user.memberships[0]?.project.publicId === projectPublicId,
  );
}

export function editableViewerIdentityAllowed(user: DemoIdentity | null, projectPublicId: string) {
  return Boolean(
    user &&
      user.deactivatedAt === null &&
      user.emailVerified &&
      !user.isInstanceAdmin &&
      user.twoFactorEnabled === false &&
      user.role === "viewer" &&
      user.memberships.length === 1 &&
      user.memberships[0]?.role === "viewer" &&
      user.memberships[0]?.project.publicId === projectPublicId,
  );
}

export function editableOwnerIdentityAllowed(user: DemoIdentity | null, projectPublicId: string) {
  return Boolean(
    user &&
      user.deactivatedAt === null &&
      user.emailVerified &&
      user.memberships.some(
        (membership) =>
          membership.role === "owner" &&
          membership.project.publicId === projectPublicId &&
          membership.project.ownerId === user.id,
      ),
  );
}

export function demoAuthRequestAllowed(path: string, method: string) {
  if (path === "/get-session") return method === "GET";
  return method === "POST" && ["/demo/sign-in", "/sign-out"].includes(path);
}

export function editableDemoAuthRequestAllowed(path: string, method: string) {
  // The provider resumes its GET authorization endpoint inside the sign-in POST hook.
  if (path === "/oauth2/authorize") return method === "GET" || method === "POST";
  if (
    [
      "/get-session",
      "/jwks",
      "/.well-known/oauth-authorization-server",
      "/.well-known/openid-configuration",
    ].includes(path)
  )
    return method === "GET";
  if (method !== "POST") return false;
  return [
    "/demo/sign-in",
    "/sign-out",
    "/email-otp/send-verification-otp",
    "/sign-in/email-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    "/email-otp/verify-email",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/oauth2/register",
    "/oauth2/consent",
    "/oauth2/continue",
    "/oauth2/token",
    "/oauth2/revoke",
  ].includes(path);
}

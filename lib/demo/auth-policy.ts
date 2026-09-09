type DemoIdentity = {
  deactivatedAt: unknown;
  emailVerified: boolean;
  isInstanceAdmin: boolean;
  role: string;
  twoFactorEnabled: boolean | null;
  memberships: { role: string; project: { publicId: string } }[];
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

export function demoAuthRequestAllowed(path: string, method: string) {
  if (path === "/get-session") return method === "GET";
  return method === "POST" && ["/demo/sign-in", "/sign-out"].includes(path);
}

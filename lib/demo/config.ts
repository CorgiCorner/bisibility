import { isPublicIdOfType } from "@/lib/db/public-id";

export const DEMO_ENTRY_CODE = "000000";
export const DEMO_ACCOUNT_LOCKED = "Account settings are locked in this demo.";

export function readOnlyDemoConfig(env: Record<string, string | undefined> = process.env) {
  if (env.READ_ONLY_DEMO !== "1") return null;
  if (env.DEMO_FIXED_OTP === "1" || env.ALLOW_INSECURE_FIXED_OTP === "1") {
    throw new Error("Read-only demo must not enable global fixed-code authentication.");
  }
  const userPublicId = env.DEMO_USER_ID ?? "";
  const projectPublicId = env.DEMO_PROJECT_ID ?? "";
  if (!isPublicIdOfType(userPublicId, "usr") || !isPublicIdOfType(projectPublicId, "prj")) {
    throw new Error("Read-only demo requires valid DEMO_USER_ID and DEMO_PROJECT_ID.");
  }
  return { userPublicId, projectPublicId };
}

export function assertDemoAccountMutable() {
  if (readOnlyDemoConfig()) throw new Error(DEMO_ACCOUNT_LOCKED);
}

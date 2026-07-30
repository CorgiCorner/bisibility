export const FIRST_RUN_SIGN_IN_HEADER = "x-bisibility-first-run";
export const FIRST_RUN_SIGN_IN_VALUE = "setup";

export function isFirstRunSignInRequest(request: Request) {
  return (
    request.headers.get(FIRST_RUN_SIGN_IN_HEADER) === FIRST_RUN_SIGN_IN_VALUE &&
    new URL(request.url).pathname.endsWith("/api/auth/sign-in/email-otp")
  );
}

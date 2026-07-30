"use client";

import { TWO_FACTOR_CHALLENGE_PATH } from "@/lib/auth/two-factor-routes";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { emailOTPClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    oauthProviderClient(),
    emailOTPClient(),
    twoFactorClient({
      twoFactorPage: TWO_FACTOR_CHALLENGE_PATH,
    }),
  ],
});

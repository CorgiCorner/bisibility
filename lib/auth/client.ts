"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { emailOTPClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    oauthProviderClient(),
    emailOTPClient(),
    twoFactorClient({
      // Sign-in call sites own navigation so they can preserve their return destination.
      onTwoFactorRedirect() {},
    }),
  ],
});

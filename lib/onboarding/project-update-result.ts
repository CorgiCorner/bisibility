export type OnboardingProjectIdentity = {
  domain: string | null;
  id: string;
  isSample?: boolean;
  name: string;
  publicId: string;
  timezone?: string;
  trackingStartedAt?: string | null;
};

// Expected conflicts cross the Server Action boundary as data, not Error properties.
export type UpdateOnboardingProjectResult =
  | { ok: true; changed: boolean; project: OnboardingProjectIdentity }
  | {
      ok: false;
      error: { code: "PROJECT_HAS_RANK_CHECKS" };
      project: OnboardingProjectIdentity & { trackingStartedAt: string };
    };

import type { CreateOnboardingProjectResult } from "@/lib/onboarding/project-update-result";

export async function createOnboardingProject(): Promise<CreateOnboardingProjectResult> {
  return {
    ok: true,
    project: {
      domain: "example.com",
      id: "prj_preview",
      name: "Example",
      publicId: "prj_preview",
      timezone: "UTC",
    },
  };
}

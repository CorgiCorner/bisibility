"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  feedbackClass,
  inputClass,
  labelClass,
  onboardingFormId,
} from "@/components/onboarding/onboarding-form-utils";
import { DataResidencyNote } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type OnboardingWebsiteInput,
  onboardingWebsiteSchema,
  type WebsiteProjectIdentity,
} from "@/lib/onboarding/website";
import { useRouter } from "next/navigation";
import { type FocusEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export type CreateProjectFormValues = z.infer<typeof onboardingWebsiteSchema>;

type CreatedProject = {
  domain: string | null;
  id: string;
  isSample?: boolean;
  name: string;
  publicId: string;
};

type StepCreateProjectProps = {
  createProjectAction?: (input: OnboardingWebsiteInput) => Promise<CreatedProject>;
  dataResidencyMessage?: string;
  defaultValues?: CreateProjectFormValues;
  deriveWebsiteAction?: (input: OnboardingWebsiteInput) => Promise<WebsiteProjectIdentity>;
  flowState?: OnboardingFlowState;
  initialProject?: CreatedProject | null;
  onComplete?: (
    values: CreateProjectFormValues,
    project: CreatedProject,
    completion?: { warning?: string | null },
  ) => void;
};

export function StepCreateProject({
  createProjectAction,
  dataResidencyMessage,
  defaultValues,
  deriveWebsiteAction,
  flowState,
  initialProject,
  onComplete,
}: Readonly<StepCreateProjectProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<WebsiteProjectIdentity | null>(() =>
    initialProject?.domain ? { domain: initialProject.domain, name: initialProject.name } : null,
  );
  const [isDeriving, setIsDeriving] = useState(false);
  const derivationId = useRef(0);
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setError,
    trigger,
  } = useForm<CreateProjectFormValues>({
    defaultValues: defaultValues ?? { website: initialProject?.domain ?? "" },
    resolver: zodResolver(onboardingWebsiteSchema),
  });
  const websiteField = register("website");

  function advance(values: CreateProjectFormValues, project: CreatedProject) {
    onComplete?.(values, project);
    if (!onComplete) {
      router.push(buildOnboardingStepHref(2, { ...flowState, projectId: project.publicId }));
    }
  }

  async function deriveWebsite(event: FocusEvent<HTMLInputElement>) {
    websiteField.onBlur(event);
    const website = event.currentTarget.value;
    const requestId = ++derivationId.current;
    const isValid = await trigger("website");
    if (
      !deriveWebsiteAction ||
      !isValid ||
      derivationId.current !== requestId ||
      getValues("website") !== website
    ) {
      if (derivationId.current === requestId) {
        setIdentity(null);
      }
      return;
    }

    setIsDeriving(true);
    try {
      const result = await deriveWebsiteAction({ website });
      if (derivationId.current === requestId && getValues("website") === website) {
        clearErrors("website");
        setIdentity(result);
      }
    } catch (error) {
      if (derivationId.current === requestId && getValues("website") === website) {
        setIdentity(null);
        setError("website", { message: actionErrorMessage(error), type: "server" });
      }
    } finally {
      if (derivationId.current === requestId) {
        setIsDeriving(false);
      }
    }
  }

  async function onSubmit(values: CreateProjectFormValues) {
    setActionError(null);
    try {
      if (initialProject) {
        advance(values, initialProject);
        return;
      }
      if (!createProjectAction) {
        return;
      }
      const project = await createProjectAction(values);
      advance(values, project);
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <form id={onboardingFormId} onSubmit={handleSubmit(onSubmit)}>
      <div className="text-lg font-semibold tracking-[-0.4px]">Create project</div>
      <div className="mt-1 text-[13px] text-fg-muted">Enter the website you want to track.</div>
      {dataResidencyMessage ? (
        <DataResidencyNote className="mt-4 max-w-[440px]" message={dataResidencyMessage} />
      ) : null}

      <div className="mt-[22px] flex max-w-[440px] flex-col gap-4">
        <label className={labelClass}>
          Your website
          <input
            className={`${inputClass} font-mono text-sm`}
            placeholder="https://example.com"
            {...websiteField}
            onBlur={deriveWebsite}
            onChange={(event) => {
              derivationId.current += 1;
              websiteField.onChange(event);
              setIdentity(null);
              setIsDeriving(false);
            }}
          />
          {errors.website ? (
            <span className={`${feedbackClass} text-red-text`}>{errors.website.message}</span>
          ) : null}
        </label>
        <p aria-live="polite" className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">
          {isDeriving ? "Checking website..." : null}
          {!isDeriving && identity ? (
            <>
              Project name: <span className="font-medium text-fg">{identity.name}</span>
            </>
          ) : null}
          {!isDeriving && !identity ? "Your project name will be derived from the website." : null}
        </p>
        <p className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">
          www and every subdomain of your domain count as yours - matching is fixed today, per-scope
          control is on the roadmap.
        </p>
      </div>

      {actionError ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
      ) : null}
      {isSubmitting ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-fg-muted`}>Saving project...</p>
      ) : null}
    </form>
  );
}

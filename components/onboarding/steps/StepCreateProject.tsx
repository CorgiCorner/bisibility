"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  feedbackClass,
  onboardingFormId,
} from "@/components/onboarding/onboarding-form-utils";
import { DataResidencyNote } from "@/components/ui/DataResidencyNote";
import { DomainIconLayer } from "@/components/ui/DomainIconLayer";
import { buildPublicDomainIconUrl } from "@/components/ui/domain-icon-url";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type {
  OnboardingProjectIdentity as CreatedProject,
  UpdateOnboardingProjectResult,
} from "@/lib/onboarding/project-update-result";
import {
  type OnboardingWebsiteInput,
  onboardingWebsiteSchema,
  type WebsiteProjectIdentity,
} from "@/lib/onboarding/website";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/csr/Globe";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FocusEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { TrackedWebsiteNotice } from "./TrackedWebsiteNotice";

export const WEBSITE_MATCHING_HINT =
  "www and every subdomain of your domain count as yours - matching is fixed today, per-scope control is on the roadmap.";

export type CreateProjectFormValues = z.infer<typeof onboardingWebsiteSchema>;

type CreateProjectActionInput = OnboardingWebsiteInput & { timezone?: string };

type StepCreateProjectProps = {
  browserTimezone?: string;
  createProjectAction?: (input: CreateProjectActionInput) => Promise<CreatedProject>;
  updateProjectAction?: (
    input: OnboardingWebsiteInput & { projectId: string },
  ) => Promise<UpdateOnboardingProjectResult>;
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

function resolvedBrowserTimezone(): string {
  try {
    // Timezone detection only - not date-order formatting.
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

export function StepCreateProject({
  browserTimezone = resolvedBrowserTimezone(),
  createProjectAction,
  updateProjectAction,
  dataResidencyMessage,
  defaultValues,
  deriveWebsiteAction,
  flowState,
  initialProject,
  onComplete,
}: Readonly<StepCreateProjectProps>) {
  const router = useRouter();
  const [measuredProject, setMeasuredProject] = useState(
    initialProject?.trackingStartedAt ? initialProject : null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<WebsiteProjectIdentity | null>(() =>
    initialProject?.domain ? { domain: initialProject.domain, name: initialProject.name } : null,
  );
  const [isDeriving, setIsDeriving] = useState(false);
  const [faviconSrc, setFaviconSrc] = useState<string | null>(null);
  const derivationId = useRef(0);
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setError,
    setFocus,
    setValue,
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
    setFaviconSrc(buildPublicDomainIconUrl({ domain: website }));
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
      if (measuredProject) {
        advance({ website: measuredProject.domain ?? "" }, measuredProject);
        return;
      }
      if (initialProject) {
        if (values.website === initialProject.domain) {
          advance(values, initialProject);
          return;
        }
        if (!updateProjectAction) throw new Error("Website changes are unavailable. Try again.");
        const result = await updateProjectAction({ ...values, projectId: initialProject.publicId });
        const project = { ...initialProject, ...result.project };
        if (!result.ok) {
          setMeasuredProject(project);
          setValue("website", project.domain ?? "");
          return;
        }
        advance({ website: project.domain ?? values.website }, project);
        return;
      }
      if (!createProjectAction) {
        return;
      }
      const project = await createProjectAction({ ...values, timezone: browserTimezone });
      advance(values, project);
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <form
      data-analytics-mask
      id={onboardingFormId}
      noValidate
      onSubmit={handleSubmit(onSubmit, () => {
        setFocus("website");
      })}
    >
      <h2 className="m-0 text-lg font-semibold tracking-[-0.4px]">Website</h2>
      <div className="mt-1 text-[13px] text-fg-muted">Enter the website you want to track.</div>
      {dataResidencyMessage ? (
        <DataResidencyNote className="mt-4 max-w-[440px]" message={dataResidencyMessage} />
      ) : null}

      {measuredProject?.trackingStartedAt ? (
        <TrackedWebsiteNotice
          domain={measuredProject.domain ?? ""}
          since={measuredProject.trackingStartedAt}
        />
      ) : (
        <div className="mt-5.5 flex max-w-[440px] flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel
              className="text-[10px] uppercase tracking-[0.5px] text-fg-muted"
              help={WEBSITE_MATCHING_HINT}
              htmlFor="onboarding-website"
              label="Your website"
            />
            <div
              className="relative flex h-10 w-full min-w-0 items-center overflow-hidden rounded-lg bg-transparent font-sans text-sm font-normal text-fg ring-1 ring-border shadow-xs transition-[box-shadow] duration-[var(--motion-tooltip)] ease-[ease] motion-reduce:transition-none hover:ring-border-control focus-within:ring-[1.25px] focus-within:ring-accent focus-within:hover:ring-[1.25px] focus-within:hover:ring-accent has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50 has-[[aria-invalid=true]]:ring-red/40"
              data-slot="input-wrapper"
            >
              <span
                aria-hidden
                className="flex h-full w-10 shrink-0 items-center justify-center border-border border-r bg-bg-sunken text-fg-muted"
              >
                <span
                  className="relative grid size-5 place-items-center overflow-hidden rounded-[4px]"
                  data-testid="onboarding-domain-icon"
                >
                  <Globe className="size-4" size={16} weight="regular" />
                  <DomainIconLayer
                    layerClassName="rounded-[4px] border border-border"
                    src={faviconSrc}
                    testId="onboarding-domain-favicon"
                  />
                </span>
              </span>
              <input
                aria-describedby={errors.website ? "onboarding-website-error" : undefined}
                aria-invalid={errors.website ? true : undefined}
                aria-required="true"
                autoCapitalize="none"
                autoComplete="url"
                className="h-full min-w-0 flex-1 bg-transparent px-3 font-sans text-sm text-fg outline-none placeholder:font-normal placeholder:text-sm placeholder:text-fg-muted focus-visible:outline-none"
                id="onboarding-website"
                inputMode="url"
                placeholder="https://example.com"
                required
                spellCheck={false}
                type="url"
                {...websiteField}
                onBlur={deriveWebsite}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  derivationId.current += 1;
                  websiteField.onChange(event);
                  setFaviconSrc(null);
                  setIdentity(null);
                  setIsDeriving(false);
                }}
              />
            </div>
            {errors.website ? (
              <span className={`${feedbackClass} text-red-text`} id="onboarding-website-error">
                {errors.website.message}
              </span>
            ) : null}
          </div>
          <p aria-live="polite" className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">
            {isDeriving ? "Checking website..." : null}
            {!isDeriving && identity ? (
              <>
                Project name: <span className="font-medium text-fg">{identity.name}</span>
              </>
            ) : null}
            {!isDeriving && !identity ? "We'll use the website as the project name." : null}
          </p>
        </div>
      )}

      {actionError ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
      ) : null}
      {isSubmitting ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-fg-muted`}>Saving project...</p>
      ) : null}
    </form>
  );
}

"use client";

import {
  defaultMatchingScopeValues,
  MatchingScopeFields,
  type MatchingScopeForm,
  matchingScopeValuesSchema,
} from "@/components/onboarding/MatchingScopeFields";
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
import { createCloudImportWorkspace } from "@/lib/actions/cloud";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type CreateProjectInput, createProjectSchema, domainSchema } from "@/lib/schemas/project";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

const createProjectFormSchema = createProjectSchema
  .pick({ name: true })
  .extend({ domain: domainSchema })
  .extend(matchingScopeValuesSchema.shape);

export type CreateProjectFormValues = z.infer<typeof createProjectFormSchema>;

type CreatedProject = {
  domain: string | null;
  id: string;
  isSample?: boolean;
  name: string;
  publicId: string;
};

type StepCreateProjectProps = {
  createProjectAction?: (input: CreateProjectInput) => Promise<CreatedProject>;
  dataResidencyMessage?: string;
  defaultValues?: CreateProjectFormValues;
  flowState?: OnboardingFlowState;
  initialProject?: CreatedProject | null;
  isCloud?: boolean;
  onComplete?: (
    values: CreateProjectFormValues,
    project: CreatedProject,
    completion?: { warning?: string | null },
  ) => void;
  saveMatchingScopeAction?: (input: MatchingScopeForm) => Promise<unknown>;
};

function CloudImportWorkspaceButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const destination = await createCloudImportWorkspace();
        router.push(destination, { scroll: true });
      } catch (error_) {
        setError(actionErrorMessage(error_, "Import project could not be opened."));
      }
    });
  }

  return (
    <form
      className="mt-6 rounded-xl border border-border-strong bg-transparent p-4"
      onSubmit={handleSubmit}
    >
      <button
        className="inline-flex min-h-9 items-center rounded-lg text-[13px] font-semibold text-fg-muted transition-colors hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          "Opening import..."
        ) : (
          <>
            Migrating from a self-hosted instance?{" "}
            <span className="underline decoration-current underline-offset-2">
              Import it instead
            </span>
          </>
        )}
      </button>
      {error ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function StepCreateProject({
  createProjectAction,
  dataResidencyMessage,
  defaultValues,
  flowState,
  initialProject,
  isCloud = false,
  onComplete,
  saveMatchingScopeAction,
}: Readonly<StepCreateProjectProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    watch,
  } = useForm<CreateProjectFormValues>({
    defaultValues: defaultValues ?? {
      ...defaultMatchingScopeValues,
      domain: initialProject?.domain ?? "",
      name: initialProject?.name ?? "",
    },
    resolver: zodResolver(createProjectFormSchema),
  });
  const domain = watch("domain");
  const matchingScopeValues = {
    includeSubdomains: watch("includeSubdomains"),
    rootAndWww: watch("rootAndWww"),
    urlPrefix: watch("urlPrefix"),
  };

  async function saveMatchingScope(projectId: string, values: CreateProjectFormValues) {
    if (!saveMatchingScopeAction) {
      return;
    }
    await saveMatchingScopeAction({
      includeSubdomains: values.includeSubdomains,
      projectId,
      rootAndWww: values.rootAndWww,
      urlPrefix: values.urlPrefix,
    });
  }

  function advance(
    values: CreateProjectFormValues,
    project: CreatedProject,
    warning: string | null = null,
  ) {
    if (warning) {
      onComplete?.(values, project, { warning });
    } else {
      onComplete?.(values, project);
    }
    if (onComplete) {
      return;
    }
    router.push(buildOnboardingStepHref(2, { ...flowState, projectId: project.publicId }));
  }

  async function onSubmit(values: CreateProjectFormValues) {
    setActionError(null);

    try {
      if (initialProject) {
        await saveMatchingScope(initialProject.publicId, values);
        advance(values, initialProject);
        return;
      }

      if (!createProjectAction) {
        return;
      }

      const input: CreateProjectInput = {
        domain: values.domain,
        name: values.name,
      };

      const project = await createProjectAction(input);
      await saveMatchingScope(project.publicId, values);
      advance(values, project);
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <>
      <form id={onboardingFormId} onSubmit={handleSubmit(onSubmit)}>
        <div className="text-lg font-semibold tracking-[-0.4px]">Create project</div>
        <div className="mt-1 text-[13px] text-fg-muted">
          Name the project and define what counts as your site.
        </div>
        {dataResidencyMessage ? (
          <DataResidencyNote className="mt-4 max-w-[440px]" message={dataResidencyMessage} />
        ) : null}

        <div className="mt-[22px] flex max-w-[440px] flex-col gap-4">
          <label className={labelClass}>
            {"Project name "}
            <input
              className={`${inputClass} font-sans text-sm`}
              placeholder="e.g. Acme"
              {...register("name")}
            />
            {errors.name ? (
              <span className={`${feedbackClass} text-red-text`}>{errors.name.message}</span>
            ) : null}
          </label>
          <label className={labelClass}>
            {"Domain "}
            <input
              className={`${inputClass} font-mono text-sm`}
              placeholder="example.com"
              {...register("domain")}
            />
            {errors.domain ? (
              <span className={`${feedbackClass} text-red-text`}>{errors.domain.message}</span>
            ) : null}
          </label>
        </div>

        <div className="mt-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Ownership matching
          </div>
          <div className="mt-1 text-[13px] text-fg-muted">
            Choose which search result URLs should count as yours.
          </div>
          <MatchingScopeFields domain={domain} register={register} values={matchingScopeValues} />
        </div>

        {actionError ? (
          <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
        ) : null}
        {isSubmitting ? (
          <p className={`m-0 mt-3 ${feedbackClass} text-fg-muted`}>Saving project...</p>
        ) : null}
      </form>
      {isCloud ? <CloudImportWorkspaceButton /> : null}
    </>
  );
}

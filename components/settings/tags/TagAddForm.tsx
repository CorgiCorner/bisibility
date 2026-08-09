"use client";

import { Button } from "@/components/ui";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const tagNameSchema = z.string().trim().min(1, "Tag name is required.").max(48);
const createTagFormSchema = z.object({
  name: tagNameSchema,
  projectId: z.string().trim().min(1).max(120),
});

type CreateTagForm = z.infer<typeof createTagFormSchema>;

export type CreateTagAction = (input: CreateTagForm) => Promise<ActionResult<{ created: boolean }>>;

type TagAddFormProps = {
  createTag: CreateTagAction;
  projectId: string;
};

function errorMessage(error: unknown) {
  return actionErrorMessage(error, "Tag could not be added.");
}

export function TagAddForm({ createTag, projectId }: Readonly<TagAddFormProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateTagForm>({
    defaultValues: { name: "", projectId },
    mode: "onChange",
    resolver: zodResolver(createTagFormSchema),
  });

  function onSubmit(values: CreateTagForm) {
    setMessage(null);
    startTransition(() => {
      void createTag(values)
        .then(unwrapActionResult)
        .then(() => {
          reset({ name: "", projectId });
          setMessage("Tag added.");
          router.refresh();
        })
        .catch((error: unknown) => setMessage(errorMessage(error)));
    });
  }

  return (
    <form className="grid gap-1.5 sm:w-[280px]" onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register("projectId")} />
      <span className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="new-tag-name">
          New tag name
        </label>
        <input
          className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-transparent px-3 text-[12.5px] font-medium text-fg outline-none focus:border-accent"
          id="new-tag-name"
          placeholder="New tag"
          {...register("name")}
        />
        <Button
          loading={isPending}
          startIcon={<Plus aria-hidden size={14} weight="bold" />}
          type="submit"
          variant="primary"
        >
          Add tag
        </Button>
      </span>
      <span className="font-mono text-[10.5px] text-fg-muted">
        {errors.name?.message ?? message}
      </span>
    </form>
  );
}

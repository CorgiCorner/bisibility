"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TagChip } from "@/components/ui/TagChip";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type AliasPillsProps = {
  aliases: string[];
  canEdit: boolean;
  competitorId: string;
  initiallyEditing?: boolean;
  projectId: string;
  updateAliases: UpdateAliasesAction;
};

type AliasForm = { alias: string };
export type UpdateAliasesAction = (input: {
  aliases: string[];
  competitorId: string;
  projectId: string;
}) => Promise<unknown>;

const aliasSchema = z.object({ alias: z.string().trim().min(1, "Aliases cannot be empty.") });
export function AliasPills({
  aliases,
  canEdit,
  competitorId,
  initiallyEditing = false,
  projectId,
  updateAliases,
}: Readonly<AliasPillsProps>) {
  const [currentAliases, setCurrentAliases] = useState(aliases);
  const [editing, setEditing] = useState(initiallyEditing);
  const [message, setMessage] = useState<string | null>(null);
  const changeRevision = useRef(0);
  const confirmedAliases = useRef([...aliases]);
  const saveQueue = useRef(Promise.resolve());
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<AliasForm>({ defaultValues: { alias: "" }, resolver: zodResolver(aliasSchema) });

  function saveAliases(nextAliases: string[]) {
    const aliasesSnapshot = [...nextAliases];
    const revision = changeRevision.current + 1;
    changeRevision.current = revision;
    setCurrentAliases(aliasesSnapshot);
    setMessage(null);
    const save = async () => {
      if (revision !== changeRevision.current) return;

      try {
        await updateAliases({ aliases: aliasesSnapshot, competitorId, projectId });
        confirmedAliases.current = aliasesSnapshot;
      } catch (error: unknown) {
        changeRevision.current += 1;
        setCurrentAliases([...confirmedAliases.current]);
        setMessage(actionErrorMessage(error, "Aliases could not be updated."));
      }
    };

    saveQueue.current = saveQueue.current.then(save, save);
  }

  function addAlias({ alias }: AliasForm) {
    const normalized = alias.trim();
    if (currentAliases.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      setError("alias", { message: "Aliases must be unique.", type: "validate" });
      return;
    }
    saveAliases([...currentAliases, normalized]);
    reset();
    setEditing(false);
  }

  function removeAlias(alias: string) {
    saveAliases(currentAliases.filter((item) => item !== alias));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-alias-pills="">
      {currentAliases.map((alias) => (
        <TagChip
          key={alias}
          label={alias}
          onRemove={canEdit ? () => removeAlias(alias) : undefined}
          removeLabel={`Remove alias ${alias}`}
        />
      ))}
      {canEdit && !editing ? (
        <Button
          onClick={() => setEditing(true)}
          size="xs"
          startIcon={<Plus aria-hidden size={13} weight="regular" />}
          variant="ghost"
        >
          Add alias
        </Button>
      ) : null}
      {canEdit && editing ? (
        <form className="flex w-full min-w-0 items-center gap-1" onSubmit={handleSubmit(addAlias)}>
          <Input
            aria-label="New brand alias"
            className="h-8 min-h-8 min-w-0 flex-1 px-2 py-1 text-[12px]"
            {...register("alias")}
          />
          <Button
            aria-label="Save alias"
            size="xs"
            style={{ minWidth: 32, padding: 0, width: 32 }}
            variant="secondary"
            type="submit"
          >
            <Check aria-hidden size={14} weight="regular" />
          </Button>
          <Button
            aria-label="Cancel alias"
            size="xs"
            style={{ minWidth: 32, padding: 0, width: 32 }}
            variant="ghost"
            onClick={() => {
              reset();
              setEditing(false);
            }}
            type="button"
          >
            <X aria-hidden size={14} weight="regular" />
          </Button>
        </form>
      ) : null}
      {errors.alias?.message || message ? (
        <span className="basis-full text-[11px] text-red-text" role="alert">
          {errors.alias?.message ?? message}
        </span>
      ) : null}
    </div>
  );
}

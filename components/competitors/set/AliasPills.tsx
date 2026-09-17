"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TagChip } from "@/components/ui/TagChip";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
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

function aliasSchema(emptyMessage: string) {
  return z.object({ alias: z.string().trim().min(1, emptyMessage) });
}
export function AliasPills({
  aliases,
  canEdit,
  competitorId,
  initiallyEditing = false,
  projectId,
  updateAliases,
}: Readonly<AliasPillsProps>) {
  const t = useTranslations("projectCompetitors.ui");
  const sharedErrors = useSharedErrorMessages();
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
  } = useForm<AliasForm>({
    defaultValues: { alias: "" },
    resolver: zodResolver(aliasSchema(t("aliasesEmpty"))),
  });

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
        setMessage(presentSafeActionError(error, sharedErrors, t("aliasesUpdateError")));
      }
    };

    saveQueue.current = saveQueue.current.then(save, save);
  }

  function addAlias({ alias }: AliasForm) {
    const normalized = alias.trim();
    if (currentAliases.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      setError("alias", { message: t("aliasesUnique"), type: "validate" });
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
          removeLabel={t("removeAlias", { alias })}
        />
      ))}
      {canEdit && !editing ? (
        <Button
          onClick={() => setEditing(true)}
          size="xs"
          startIcon={<Plus aria-hidden size={13} weight="regular" />}
          variant="ghost"
        >
          {t("addAlias")}
        </Button>
      ) : null}
      {canEdit && editing ? (
        <form className="flex w-full min-w-0 items-center gap-1" onSubmit={handleSubmit(addAlias)}>
          <Input
            aria-label={t("newBrandAlias")}
            className="h-8 min-h-8 min-w-0 flex-1 px-2 py-1 text-[12px]"
            {...register("alias")}
          />
          <Button
            aria-label={t("saveAlias")}
            size="xs"
            style={{ minWidth: 32, padding: 0, width: 32 }}
            variant="secondary"
            type="submit"
          >
            <Check aria-hidden size={14} weight="regular" />
          </Button>
          <Button
            aria-label={t("cancelAlias")}
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

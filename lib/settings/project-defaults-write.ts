import type { Prisma } from "@/lib/generated/prisma/client";

type ProjectDefaultsWriteInput = {
  defaults: Omit<Prisma.ProjectDefaultsUncheckedCreateInput, "projectId">;
  projectId: string;
  serpStopOnMatch?: boolean;
};

export function projectDefaultsUpsertArgs({
  defaults,
  projectId,
  serpStopOnMatch,
}: ProjectDefaultsWriteInput): {
  create: Prisma.ProjectDefaultsUncheckedCreateInput;
  update: Prisma.ProjectDefaultsUncheckedUpdateInput;
  where: { projectId: string };
} {
  const stopOnMatchUpdate = serpStopOnMatch === undefined ? {} : { serpStopOnMatch };

  return {
    create: { ...defaults, ...stopOnMatchUpdate, projectId },
    update: { ...defaults, ...stopOnMatchUpdate },
    where: { projectId },
  };
}

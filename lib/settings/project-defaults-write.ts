type ProjectDefaultsWriteInput<TDefaults extends object> = {
  defaults: TDefaults;
  projectId: string;
  serpStopOnMatch?: boolean;
};

export function projectDefaultsUpsertArgs<TDefaults extends object>({
  defaults,
  projectId,
  serpStopOnMatch,
}: ProjectDefaultsWriteInput<TDefaults>) {
  const stopOnMatchUpdate = serpStopOnMatch === undefined ? {} : { serpStopOnMatch };

  return {
    create: { ...defaults, ...stopOnMatchUpdate, projectId },
    update: { ...defaults, ...stopOnMatchUpdate },
    where: { projectId },
  };
}

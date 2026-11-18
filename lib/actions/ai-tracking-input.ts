export function stampAppScheduleInput(input: unknown, actorId: string): unknown {
  if (!(input as { configuration?: unknown }).configuration) return input;
  return {
    ...(input as object),
    configuration: {
      ...(input as { configuration: object }).configuration,
      requirePayment: true,
      actorId,
      actorCredential: undefined,
      entrySource: "app",
      origin: "manual",
    },
  };
}

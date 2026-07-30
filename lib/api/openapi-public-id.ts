export function publicIdSchema(prefix: string) {
  return {
    example: `${prefix}_a00000000000000000000000`,
    pattern: `^${prefix}_[a-z][a-z0-9]{23}$`,
    type: "string",
  } as const;
}

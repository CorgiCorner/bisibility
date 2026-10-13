export function databaseSchemaFromUrl(connectionString: string): string | undefined;
export function databaseConnectionConfig(connectionString: string): {
  connectionString?: string;
  options: string;
};

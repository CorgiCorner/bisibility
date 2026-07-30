const DATABASE_SCHEMA_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export function databaseSchemaFromUrl(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return undefined;
  }

  const schema = url.searchParams.get("schema")?.trim();
  if (!schema) {
    return undefined;
  }
  if (!DATABASE_SCHEMA_PATTERN.test(schema)) {
    throw new Error(
      "Database schema must be a PostgreSQL identifier with at most 63 ASCII characters",
    );
  }
  return schema;
}

export function databaseConnectionConfig(connectionString) {
  const schema = databaseSchemaFromUrl(connectionString);
  return schema ? { options: `-c search_path="${schema}"` } : {};
}

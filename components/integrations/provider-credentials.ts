export type CredentialFieldShape = {
  label: string;
  name: "endpoint" | "login" | "secret";
  optional?: boolean;
};

export type CredentialFieldValues = {
  credentials?: {
    apiKey?: string;
    endpoint?: string;
    login?: string;
    secret?: string;
  };
  endpoint?: string;
  login?: string;
  secret?: string;
};

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

export function valueForCredentialField(
  fieldName: CredentialFieldShape["name"],
  values: CredentialFieldValues,
) {
  if (fieldName === "endpoint") {
    return values.endpoint ?? values.credentials?.endpoint;
  }

  if (fieldName === "login") {
    return values.login ?? values.credentials?.login;
  }

  return values.secret ?? values.credentials?.secret ?? values.credentials?.apiKey;
}

export function missingCredentialFields(
  fields: readonly CredentialFieldShape[],
  values: CredentialFieldValues,
) {
  return fields.filter(
    (field) => !field.optional && !hasValue(valueForCredentialField(field.name, values)),
  );
}

export function hasRequiredCredentialFields(
  fields: readonly CredentialFieldShape[],
  values: CredentialFieldValues,
) {
  return missingCredentialFields(fields, values).length === 0;
}

export function credentialFieldIssueMessage(field: CredentialFieldShape) {
  return `Enter your ${field.label}.`;
}

export function credentialFieldsSignature(
  fields: readonly CredentialFieldShape[],
  values: CredentialFieldValues,
) {
  return fields
    .map((field) => `${field.name}:${valueForCredentialField(field.name, values)?.trim() ?? ""}`)
    .join("|");
}

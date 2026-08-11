import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { ProviderCredentials } from "./types";

const CIPHER = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const KEY_ID_LENGTH = 8;
const HASH_PREFIX = "sha256:";
const LEGACY_SECRET_PREFIX = "v1";
const SECRET_PREFIX = "v2";

type SecretKey = {
  id: string;
  value: Buffer;
};

type EncryptedSecretEnvelope =
  | {
      iv: string | undefined;
      tag: string | undefined;
      value: string | undefined;
      version: typeof LEGACY_SECRET_PREFIX;
    }
  | {
      iv: string | undefined;
      keyId: string | undefined;
      tag: string | undefined;
      value: string | undefined;
      version: typeof SECRET_PREFIX;
    };

function parseEncryptedSecret(encrypted: string): EncryptedSecretEnvelope | undefined {
  const parts = encrypted.split(":");
  if (parts[0] === LEGACY_SECRET_PREFIX && parts.length === 4) {
    return {
      iv: parts[1],
      tag: parts[2],
      value: parts[3],
      version: LEGACY_SECRET_PREFIX,
    };
  }
  if (parts[0] === SECRET_PREFIX && parts.length === 5) {
    return {
      iv: parts[2],
      keyId: parts[1],
      tag: parts[3],
      value: parts[4],
      version: SECRET_PREFIX,
    };
  }
  return undefined;
}

function parseSecretKey(raw: string, variableName: string) {
  const normalized = raw.trim();
  const isCanonicalBase64 =
    normalized.length > 0 &&
    normalized.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
  const key = Buffer.from(normalized, "base64");

  if (!isCanonicalBase64 || key.toString("base64") !== normalized || key.length !== KEY_LENGTH) {
    throw new Error(`${variableName} must contain base64-encoded 32-byte keys.`);
  }

  return key;
}

function identifySecretKey(value: Buffer): SecretKey {
  return {
    id: createHash("sha256").update(value).digest("hex").slice(0, KEY_ID_LENGTH),
    value,
  };
}

function getPrimarySecretKey() {
  const configured = process.env.BISIBILITY_SECRETS_KEY;

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BISIBILITY_SECRETS_KEY is required to encrypt provider credentials.");
    }

    return identifySecretKey(createHash("sha256").update("bisibility-dev-secrets-key").digest());
  }

  return identifySecretKey(parseSecretKey(configured, "BISIBILITY_SECRETS_KEY"));
}

function getSecretKeyring() {
  const primary = getPrimarySecretKey();
  const configuredRetired = process.env.BISIBILITY_SECRETS_KEYS_RETIRED?.trim();
  if (!configuredRetired) {
    return { primary, byId: new Map([[primary.id, primary.value]]) };
  }

  const retired = configuredRetired
    .split(",")
    .map((raw) => identifySecretKey(parseSecretKey(raw, "BISIBILITY_SECRETS_KEYS_RETIRED")));
  return {
    primary,
    byId: new Map([primary, ...retired].map((key) => [key.id, key.value])),
  };
}

export function encryptSecret(raw: string) {
  const { primary } = getSecretKeyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, primary.value, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    primary.id,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function isSecretEncryptedWithPrimary(encrypted: string) {
  const envelope = parseEncryptedSecret(encrypted);
  const { primary } = getSecretKeyring();
  return envelope?.version === SECRET_PREFIX && envelope.keyId === primary.id;
}

export function isEncryptedSecret(encrypted: string) {
  return parseEncryptedSecret(encrypted) !== undefined;
}

export function decryptSecret(encrypted: string) {
  const envelope = parseEncryptedSecret(encrypted);
  const { primary, byId } = getSecretKeyring();
  const key =
    envelope?.version === LEGACY_SECRET_PREFIX
      ? primary.value
      : envelope?.version === SECRET_PREFIX
        ? byId.get(envelope.keyId ?? "")
        : undefined;

  if (!envelope || !key || !envelope.iv || !envelope.tag || !envelope.value) {
    throw new Error("Encrypted secret has an unsupported format.");
  }

  const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.iv, "base64"), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.value, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Thrown when stored provider credentials cannot be decrypted. The public message is fixed and
 * safe; the original decryption error is kept as `cause` for classification, never for display.
 */
export class ProviderCredentialsDecryptError extends Error {
  constructor(cause: unknown) {
    super("Provider credentials could not be decrypted.", { cause });
    this.name = "ProviderCredentialsDecryptError";
  }
}

export function decryptProviderCredentials(encrypted: string | null | undefined) {
  if (!encrypted) {
    return {};
  }

  try {
    const parsed = JSON.parse(decryptSecret(encrypted)) as ProviderCredentials;
    return {
      ...(typeof parsed.apiKey === "string" ? { apiKey: parsed.apiKey } : {}),
      ...(typeof parsed.endpoint === "string" ? { endpoint: parsed.endpoint } : {}),
      ...(typeof parsed.login === "string" ? { login: parsed.login } : {}),
      ...(typeof parsed.password === "string" ? { password: parsed.password } : {}),
    };
  } catch (error) {
    throw new ProviderCredentialsDecryptError(error);
  }
}

/**
 * Hashes an application-generated, high-entropy opaque token for deterministic lookup.
 * This is not password verification; a slow KDF would only add cost to every authenticated request.
 */
// codeql[js/insufficient-password-hash] -- Opaque API token lookup, not password verification.
export function hashApiKey(raw: string) {
  return `${HASH_PREFIX}${createHash("sha256").update(raw).digest("hex")}`;
}

export function verifyApiKey(raw: string, hash: string) {
  const expected = hashApiKey(raw);
  const expectedBuffer = Buffer.from(expected);
  const hashBuffer = Buffer.from(hash);

  return expectedBuffer.length === hashBuffer.length && timingSafeEqual(expectedBuffer, hashBuffer);
}

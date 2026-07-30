import "server-only";

import { createOTP } from "@better-auth/utils/otp";
import {
  constantTimeEqual,
  generateRandomString,
  symmetricDecrypt,
  symmetricEncrypt,
} from "better-auth/crypto";
import { resolveAuthCryptoKey } from "./secret";

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

export function generateTwoFactorSecret() {
  return generateRandomString(32, "a-z", "A-Z", "0-9");
}

export function generateTwoFactorBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const code = generateRandomString(BACKUP_CODE_LENGTH, "a-z", "A-Z", "0-9");
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

export function twoFactorTotp(secret: string) {
  return createOTP(secret, { digits: 6, period: 30 });
}

export async function encryptTwoFactorValue(value: string) {
  return symmetricEncrypt({ data: value, key: resolveAuthCryptoKey() });
}

export async function decryptTwoFactorValue(value: string) {
  return symmetricDecrypt({ data: value, key: resolveAuthCryptoKey() });
}

export async function encryptBackupCodes(codes: readonly string[]) {
  return encryptTwoFactorValue(JSON.stringify(codes));
}

export async function decryptBackupCodes(value: string) {
  const parsed: unknown = JSON.parse(await decryptTwoFactorValue(value));
  if (!Array.isArray(parsed) || !parsed.every((code) => typeof code === "string")) {
    throw new TypeError("Stored backup codes are invalid.");
  }
  return parsed;
}

export function findBackupCode(codes: readonly string[], provided: string) {
  return codes.findIndex((code) => constantTimeEqual(code, provided));
}

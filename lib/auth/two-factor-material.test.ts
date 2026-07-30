import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constantTimeEqual: vi.fn(),
  generateRandomString: vi.fn(),
  symmetricDecrypt: vi.fn(),
  symmetricEncrypt: vi.fn(),
}));

vi.mock("better-auth/crypto", () => ({
  constantTimeEqual: mocks.constantTimeEqual,
  generateRandomString: mocks.generateRandomString,
  symmetricDecrypt: mocks.symmetricDecrypt,
  symmetricEncrypt: mocks.symmetricEncrypt,
}));
vi.mock("./secret", () => ({ resolveAuthCryptoKey: () => "test-crypto-key" }));

import {
  decryptBackupCodes,
  encryptBackupCodes,
  findBackupCode,
  generateTwoFactorBackupCodes,
} from "./two-factor-material";

describe("two-factor recovery material", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates ten distinct recovery codes in the displayed format", () => {
    mocks.generateRandomString.mockImplementation(
      () => `code${String(mocks.generateRandomString.mock.calls.length).padStart(6, "0")}`,
    );

    const codes = generateTwoFactorBackupCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes)).toHaveLength(10);
    expect(codes).toEqual(
      codes.map(() => expect.stringMatching(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/)),
    );
  });

  it("encrypts and validates the stored recovery-code array", async () => {
    mocks.symmetricEncrypt.mockResolvedValue("encrypted");
    mocks.symmetricDecrypt.mockResolvedValue('["abcde-12345","vwxyz-67890"]');

    await expect(encryptBackupCodes(["abcde-12345", "vwxyz-67890"])).resolves.toBe("encrypted");
    expect(mocks.symmetricEncrypt).toHaveBeenCalledWith({
      data: '["abcde-12345","vwxyz-67890"]',
      key: "test-crypto-key",
    });
    await expect(decryptBackupCodes("encrypted")).resolves.toEqual(["abcde-12345", "vwxyz-67890"]);
  });

  it("rejects malformed stored recovery material", async () => {
    mocks.symmetricDecrypt.mockResolvedValue('{"code":"abcde-12345"}');

    await expect(decryptBackupCodes("encrypted")).rejects.toThrow(
      "Stored backup codes are invalid.",
    );
  });

  it("uses the constant-time comparator for recovery-code lookup", () => {
    mocks.constantTimeEqual.mockImplementation((stored, provided) => stored === provided);

    expect(findBackupCode(["abcde-12345", "vwxyz-67890"], "vwxyz-67890")).toBe(1);
    expect(mocks.constantTimeEqual).toHaveBeenCalledWith("abcde-12345", "vwxyz-67890");
    expect(mocks.constantTimeEqual).toHaveBeenCalledWith("vwxyz-67890", "vwxyz-67890");
  });
});

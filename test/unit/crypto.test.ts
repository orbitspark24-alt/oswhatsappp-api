import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../../src/lib/crypto";

describe("crypto (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const secret = "EAAGsuper-secret-token-12345";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("fails to decrypt tampered ciphertext (auth tag check)", () => {
    const payload = encrypt("integrity-protected");
    const [iv, tag, data] = payload.split(".");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt("not-a-valid-payload")).toThrow();
  });
});

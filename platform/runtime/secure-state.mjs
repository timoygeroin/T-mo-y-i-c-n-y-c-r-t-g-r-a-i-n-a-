import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

function keyFrom(secret) {
  if (!secret || secret.length < 16) throw new Error("MONDAYID_STATE_KEY must contain at least 16 characters");
  return createHash("sha256").update(secret).digest();
}

export function encryptState(state, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

export function decryptState(envelope, secret) {
  const parsed = JSON.parse(envelope);
  if (parsed.v !== 1 || parsed.alg !== "aes-256-gcm") throw new Error("unsupported state envelope");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

export async function readEncryptedState(path, secret) {
  try { return decryptState(await readFile(path, "utf8"), secret); }
  catch (error) { if (error.code === "ENOENT") return { revision: 0, lineage: [], activeObjective: null, continuation: null, lastResult: null }; throw error; }
}

export async function writeEncryptedState(path, state, secret) {
  await writeFile(path, `${encryptState(state, secret)}\n`, { encoding: "utf8", mode: 0o600 });
}

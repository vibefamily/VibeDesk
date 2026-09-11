/**
 * Vault cryptography primitives.
 *
 * AES-256-GCM symmetric encryption with PBKDF2-SHA256 key derivation.
 * Zero OS dependencies (works identically on macOS / Windows / Linux),
 * matching the cross-platform local-first product positioning.
 *
 * All outputs are base64 strings so they can live in a JSON vault file.
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

/** Number of PBKDF2 iterations - OWASP-recommended range for local vaults. */
export const PBKDF2_ITERATIONS = 600_000
const KEY_LENGTH = 32 // AES-256
const IV_LENGTH = 12 // GCM recommended nonce size
const SALT_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/** Encrypted blob stored in the vault. */
export interface EncryptedPayload {
  /** Base64 IV (12 bytes) */
  iv: string
  /** Base64 auth tag (16 bytes) */
  tag: string
  /** Base64 ciphertext */
  data: string
  /** Salt used for PBKDF2 derivation */
  salt: string
  /** PBKDF2 iteration count (forward-compatible) */
  iterations: number
}

function toBase64(buf: Buffer): string {
  return buf.toString('base64')
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

/** Derive a 32-byte AES key from a password + salt. */
export function deriveKey(password: string, salt: Buffer, iterations = PBKDF2_ITERATIONS): Buffer {
  return pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256')
}

/** Encrypt plaintext with a password (derives key internally). */
export function encryptWithPassword(
  plaintext: string,
  password: string,
  iterations = PBKDF2_ITERATIONS,
): EncryptedPayload {
  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt, iterations)
  return encryptWithKey(plaintext, key, salt, iterations)
}

/** Decrypt a payload with a password. Throws on wrong password / tampering. */
export function decryptWithPassword(payload: EncryptedPayload, password: string): string {
  const key = deriveKey(password, fromBase64(payload.salt), payload.iterations)
  return decryptWithKey(payload, key)
}

/** Encrypt with an explicit key (used when the key is already derived). */
export function encryptWithKey(
  plaintext: string,
  key: Buffer,
  salt?: Buffer,
  iterations = PBKDF2_ITERATIONS,
): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: toBase64(iv),
    tag: toBase64(tag),
    data: toBase64(ciphertext),
    salt: toBase64(salt ?? randomBytes(SALT_LENGTH)),
    iterations,
  }
}

/** Decrypt a payload with an explicit key. */
export function decryptWithKey(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, fromBase64(payload.iv))
  decipher.setAuthTag(fromBase64(payload.tag))
  const plaintext = Buffer.concat([
    decipher.update(fromBase64(payload.data)),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

/** Cheap sanity check that a payload can be decrypted with a password. */
export function verifyPassword(payload: EncryptedPayload, password: string): boolean {
  try {
    decryptWithPassword(payload, password)
    return true
  } catch {
    return false
  }
}

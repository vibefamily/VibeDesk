/**
 * Ethereum-compatible keystore (geth / JSON wallet) import & export.
 *
 * Format: {"address", "crypto": {"cipher": "aes-128-ctr", ...,
 * "kdf": "scrypt", ...}, "version": 3} - the standard file format used
 * by geth, MetaMask and other wallets. Each keystore file is protected
 * by its own password.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { privateKeyToAddress } from './hd'

const SCRYPT_PARAMS = { N: 262_144, r: 8, p: 1, dklen: 32 }
// scrypt with N=2^18 * r=8 needs ~256MB; OpenSSL also reserves extra
// scratch memory, so allow 512MB. Keystore import/export is a rare,
// explicit operation so this peak is acceptable.
const SCRYPT_MAXMEM = 512 * 1024 * 1024

interface KeystoreCrypto {
  cipher: 'aes-128-ctr'
  cipherparams: { iv: string }
  ciphertext: string
  kdf: 'scrypt'
  kdfparams: { dklen: number; n: number; r: number; p: number; salt: string }
  mac: string
}

/** Ethereum keystore v3 JSON structure. */
export interface KeystoreV3 {
  address: string
  crypto: KeystoreCrypto
  id: string
  version: 3
}

function keccakHex(...buffers: Buffer[]): Buffer {
  const combined = Buffer.concat(buffers)
  return Buffer.from(keccak_256(combined))
}

/** Decrypt an Ethereum keystore v3 JSON with its password. */
export function decryptKeystore(json: KeystoreV3 | string, password: string): string {
  const ks: KeystoreV3 = typeof json === 'string' ? (JSON.parse(json) as KeystoreV3) : json
  const { ciphertext, kdfparams } = ks.crypto
  const derived = scryptSync(password, Buffer.from(kdfparams.salt, 'hex'), kdfparams.dklen, {
    N: kdfparams.n,
    r: kdfparams.r,
    p: kdfparams.p,
    maxmem: SCRYPT_MAXMEM,
  })
  const mac = keccakHex(derived.slice(16, 32), Buffer.from(ciphertext, 'hex'))
  if (mac.toString('hex') !== ks.crypto.mac) {
    throw new Error('Keystore: wrong password or corrupted file')
  }
  const decipher = createDecipheriv(
    'aes-128-ctr',
    derived.slice(0, 16),
    Buffer.from(ks.crypto.cipherparams.iv, 'hex'),
  )
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ])
  return `0x${plaintext.toString('hex')}`
}

/** Encrypt a private key into an Ethereum keystore v3 JSON. */
export function encryptKeystore(privateKey: string, password: string): KeystoreV3 {
  const keyBytes = Buffer.from(privateKey.replace(/^0x/i, ''), 'hex')
  const salt = randomBytes(32)
  const iv = randomBytes(16)
  const derived = scryptSync(password, salt, SCRYPT_PARAMS.dklen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_MAXMEM,
  })
  const cipher = createCipheriv('aes-128-ctr', derived.slice(0, 16), iv)
  const ciphertext = Buffer.concat([cipher.update(keyBytes), cipher.final()])
  const mac = keccakHex(derived.slice(16, 32), ciphertext)
  const address = privateKeyToAddress(privateKey).replace(/^0x/, '')
  return {
    address,
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: { iv: iv.toString('hex') },
      ciphertext: ciphertext.toString('hex'),
      kdf: 'scrypt',
      kdfparams: {
        dklen: SCRYPT_PARAMS.dklen,
        n: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        salt: salt.toString('hex'),
      },
      mac: mac.toString('hex'),
    },
    id: randomBytes(16).toString('hex'),
    version: 3,
  }
}

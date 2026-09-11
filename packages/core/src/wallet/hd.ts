/**
 * HD wallet derivation (BIP39 + BIP32, EVM addresses).
 *
 * One mnemonic generates many accounts via a derivation path, with an
 * optional BIP39 passphrase acting as an extra salt - a different
 * passphrase yields a completely different set of accounts.
 *
 * Addresses are derived as: secp256k1 public key -> keccak256 -> last 20 bytes.
 */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { HDKey } from '@scure/bip32'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'

/** Default EVM derivation path root. */
export const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0"

/** A derived EVM account. */
export interface HdAccount {
  /** Account index in the path (m/44'/60'/0'/0/{index}) */
  index: number
  /** 0x-prefixed checksummed-style lowercase address */
  address: string
  /** 0x-prefixed private key hex */
  privateKey: string
}

/** Generate a new BIP39 mnemonic (24 words by default). */
export function generateMnemonicPhrase(strength = 256): string {
  return generateMnemonic(wordlist, strength)
}

/** Validate a mnemonic phrase. */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist)
}

/** Seed from mnemonic + optional passphrase (BIP39 salt). */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedSync(mnemonic.trim(), passphrase)
}

/** Derive one EVM account from a seed at the default path + index. */
export function deriveAccount(seed: Uint8Array, index = 0, path = DEFAULT_DERIVATION_PATH): HdAccount {
  const hd = HDKey.fromMasterSeed(seed)
  const child = hd.derive(`${path}/${index}`)
  const privateKey = child.privateKey
  if (!privateKey) {
    throw new Error(`Unable to derive private key at ${path}/${index}`)
  }
  const publicKey = secp256k1.getPublicKey(privateKey, false) // 65-byte uncompressed
  const hash = keccak_256(publicKey.slice(1)) // drop the 0x04 prefix
  const address = `0x${Buffer.from(hash.slice(-20)).toString('hex')}`
  return {
    index,
    address,
    privateKey: `0x${Buffer.from(privateKey).toString('hex')}`,
  }
}

/** Derive N accounts from a mnemonic (with optional passphrase). */
export function deriveAccounts(
  mnemonic: string,
  count: number,
  passphrase = '',
  path = DEFAULT_DERIVATION_PATH,
): HdAccount[] {
  const seed = mnemonicToSeed(mnemonic, passphrase)
  return Array.from({ length: count }, (_, i) => deriveAccount(seed, i, path))
}

/** Normalize a private key to 0x-prefixed hex. */
export function normalizePrivateKey(privateKey: string): string {
  const hex = privateKey.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Invalid private key: expected 32 bytes of hex')
  }
  return `0x${hex.toLowerCase()}`
}

/** Derive the EVM address for a private key. */
export function privateKeyToAddress(privateKey: string): string {
  const normalized = normalizePrivateKey(privateKey)
  const keyBytes = Buffer.from(normalized.slice(2), 'hex')
  const publicKey = secp256k1.getPublicKey(keyBytes, false)
  const hash = keccak_256(publicKey.slice(1))
  return `0x${Buffer.from(hash.slice(-20)).toString('hex')}`
}

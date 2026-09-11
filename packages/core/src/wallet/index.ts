/**
 * Wallet module - local-first multi-wallet vault, HD derivation,
 * Ethereum keystore compatibility, and in-memory agent authorization.
 */

export { VaultWalletManager } from './WalletManager'
export type {
  CreateHdWalletResult,
  HdAccountMeta,
  VaultWalletKind,
  VaultWalletManagerOptions,
  WalletMeta,
} from './WalletManager'
export {
  PBKDF2_ITERATIONS,
  decryptWithPassword,
  encryptWithPassword,
  verifyPassword,
} from './crypto'
export type { EncryptedPayload } from './crypto'
export {
  DEFAULT_DERIVATION_PATH,
  deriveAccount,
  deriveAccounts,
  generateMnemonicPhrase,
  isValidMnemonic,
  mnemonicToSeed,
  normalizePrivateKey,
  privateKeyToAddress,
} from './hd'
export type { HdAccount } from './hd'
export { decryptKeystore, encryptKeystore } from './keystore'
export type { KeystoreV3 } from './keystore'

// Backwards-compatible legacy interfaces (kept for existing consumers).
export type { IWalletManager, IWalletProvider, ImportWalletOptions } from './types'

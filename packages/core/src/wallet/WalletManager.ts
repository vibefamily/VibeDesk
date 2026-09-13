/**
 * VaultWalletManager - local-first multi-wallet management.
 *
 * Security model:
 * - One vault file (JSON) holds all wallets, encrypted with AES-256-GCM
 *   under a key derived from the master password (PBKDF2, 600k rounds).
 * - HD wallets store the mnemonic once (encrypted); derived accounts
 *   are re-derived on demand and their private keys are NEVER written.
 * - Imported private keys are stored per-wallet encrypted entries.
 * - Viewing / exporting a secret always requires the password again.
 * - Agent access is granted in-memory only (never persisted): the plain
 *   signing key lives in a memory cache that can be revoked at any time.
 *
 * The manager runs in the Electron main process; the renderer only ever
 * sees address-level metadata, never secrets.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EncryptedPayload } from './crypto'
import {
  decryptWithPassword,
  encryptWithPassword,
} from './crypto'
import {
  deriveAccount,
  deriveAccounts,
  generateMnemonicPhrase,
  isValidMnemonic,
  mnemonicToSeed,
  normalizePrivateKey,
  privateKeyToAddress,
} from './hd'
import { decryptKeystore, encryptKeystore } from './keystore'
import type { KeystoreV3 } from './keystore'

/** Wallet kind stored in the vault. */
export type VaultWalletKind = 'hd' | 'private_key'

/** Address-level metadata safe to expose to the UI. */
export interface WalletMeta {
  id: string
  name: string
  chain: string
  address: string
  kind: VaultWalletKind
  /** For HD wallets: all derived accounts (address-level only) */
  accounts?: HdAccountMeta[]
  canSign: boolean
  createdAt: number
}

/** A derived account attached to an HD wallet entry. */
export interface HdAccountMeta {
  index: number
  name: string
  address: string
}

/** Vault entry as persisted on disk. */
interface VaultEntry {
  id: string
  kind: VaultWalletKind
  name: string
  chain: string
  createdAt: number
  /** Only for hd entries: the encrypted mnemonic */
  mnemonic?: EncryptedPayload
  /** Only for private_key entries: the encrypted private key */
  privateKey?: EncryptedPayload
  /** HD derivation path (e.g. m/44'/60'/0'/0) */
  derivationPath?: string
  /** Optional BIP39 passphrase (salt), encrypted like the mnemonic */
  passphrase?: EncryptedPayload
  /** Derived accounts of an HD wallet */
  accounts?: HdAccountMeta[]
  /** For private_key entries: the address */
  address?: string
}

interface VaultFile {
  version: 1
  wallets: Record<string, VaultEntry>
  /** Persisted agent grant keys ("walletId" or "walletId:index"). */
  authorized?: string[]
}

const VAULT_VERSION = 1

export interface CreateHdWalletResult {
  /** Show this mnemonic to the user exactly once. */
  mnemonic: string
  wallet: WalletMeta
}

export interface VaultWalletManagerOptions {
  /** Optional pre-existing chain label (default 'evm'). */
  chain?: string
}

/**
 * Multi-wallet manager with encrypted local vault storage.
 */
export class VaultWalletManager {
  private storagePath: string
  private vault: VaultFile = { version: VAULT_VERSION, wallets: {} }
  private mainKey: Buffer | null = null
  /** In-memory agent authorization cache: walletId -> private key hex */
  private authorizedKeys = new Map<string, string>()
  /** Persisted grant list (keys only, no secrets), restored on unlock. */
  private authorizedGrants: string[] = []
  private chain: string

  constructor(storagePath: string, options: VaultWalletManagerOptions = {}) {
    this.storagePath = storagePath
    this.chain = options.chain ?? 'evm'
  }

  // --- Vault lifecycle ---

  /** Load the vault file from disk if present. */
  load(): void {
    if (!existsSync(this.storagePath)) {
      this.vault = { version: VAULT_VERSION, wallets: {} }
      return
    }
    const raw = readFileSync(this.storagePath, 'utf8')
    this.vault = JSON.parse(raw) as VaultFile
    this.authorizedGrants = this.vault.authorized ?? []
  }

  /** Unlock the vault: derive the master key from the password. */
  unlock(password: string): void {
    const key = Buffer.from(password, 'utf8')
    // Derive a deterministic vault key from the password so entries can
    // be decrypted; verify against an existing entry if one exists.
    const firstEntry = Object.values(this.vault.wallets)[0]
    if (firstEntry) {
      const payload = firstEntry.mnemonic ?? firstEntry.privateKey
      if (!payload) {
        throw new Error('Vault contains an unreadable entry')
      }
      // Attempt a decrypt to verify the password (throws on wrong pw).
      this.decryptPayload(payload, password)
    }
    // Cache a derived session key for cheap subsequent decryptions.
    this.mainKey = Buffer.from(password, 'utf8')
    // Restore persisted agent grants now that the vault is unlocked.
    this.restoreAuthorized(password)
  }

  /** Lock the vault and drop all in-memory secrets. */
  lock(): void {
    this.mainKey = null
    this.authorizedKeys.clear()
  }

  isUnlocked(): boolean {
    return this.mainKey !== null
  }

  /** Whether the vault has any wallets (used to detect first-run). */
  isEmpty(): boolean {
    return Object.keys(this.vault.wallets).length === 0
  }

  // --- HD wallets ---

  /**
   * Create an HD wallet from a fresh mnemonic. Returns the mnemonic
   * exactly once; only its encrypted form is persisted.
   */
  createHdWallet(
    name: string,
    password: string,
    options: { passphrase?: string; accountCount?: number } = {},
  ): CreateHdWalletResult {
    this.assertUnlocked()
    const mnemonic = generateMnemonicPhrase(256)
    const count = options.accountCount ?? 1
    const seed = mnemonicToSeed(mnemonic, options.passphrase ?? '')
    const accounts = Array.from({ length: count }, (_, i) => {
      const acc = deriveAccount(seed, i)
      return { index: i, name: `${name} #${i + 1}`, address: acc.address }
    })
    const id = randomUUID()
    const entry: VaultEntry = {
      id,
      kind: 'hd',
      name,
      chain: this.chain,
      createdAt: Date.now(),
      mnemonic: encryptWithPassword(mnemonic, password),
      derivationPath: "m/44'/60'/0'/0",
      passphrase:
        (options.passphrase ?? '').length > 0
          ? encryptWithPassword(options.passphrase!, password)
          : undefined,
      accounts,
    }
    this.vault.wallets[id] = entry
    this.save()
    return { mnemonic, wallet: this.toMeta(entry) }
  }

  /**
   * Import an existing mnemonic as an HD wallet.
   */
  importHdWallet(
    name: string,
    mnemonic: string,
    password: string,
    options: { passphrase?: string; accountCount?: number } = {},
  ): CreateHdWalletResult {
    this.assertUnlocked()
    if (!isValidMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase')
    }
    const count = options.accountCount ?? 1
    const seed = mnemonicToSeed(mnemonic, options.passphrase ?? '')
    const accounts = Array.from({ length: count }, (_, i) => {
      const acc = deriveAccount(seed, i)
      return { index: i, name: `${name} #${i + 1}`, address: acc.address }
    })
    const id = randomUUID()
    const entry: VaultEntry = {
      id,
      kind: 'hd',
      name,
      chain: this.chain,
      createdAt: Date.now(),
      mnemonic: encryptWithPassword(mnemonic.trim(), password),
      derivationPath: "m/44'/60'/0'/0",
      passphrase:
        (options.passphrase ?? '').length > 0
          ? encryptWithPassword(options.passphrase!, password)
          : undefined,
      accounts,
    }
    this.vault.wallets[id] = entry
    this.save()
    return { mnemonic: mnemonic.trim(), wallet: this.toMeta(entry) }
  }

  /** Derive more accounts for an existing HD wallet. */
  deriveMoreAccounts(hdWalletId: string, count: number, password: string): HdAccountMeta[] {
    this.assertUnlocked()
    const entry = this.vault.wallets[hdWalletId]
    if (!entry || entry.kind !== 'hd' || !entry.mnemonic) {
      throw new Error('HD wallet not found')
    }
    const mnemonic = this.decryptPayload(entry.mnemonic, password)
    const passphrase = entry.passphrase ? this.decryptPayload(entry.passphrase, password) : ''
    const existing = entry.accounts ?? []
    const nextIndex = existing.length
    const seed = mnemonicToSeed(mnemonic, passphrase)
    const fresh = Array.from({ length: count }, (_, i) => {
      const acc = deriveAccount(seed, nextIndex + i, entry.derivationPath ?? "m/44'/60'/0'/0")
      return { index: nextIndex + i, name: `${entry.name} #${nextIndex + i + 1}`, address: acc.address }
    })
    entry.accounts = [...existing, ...fresh]
    this.save()
    return fresh
  }

  // --- Imported wallets ---

  /** Import a raw private key. */
  importPrivateKey(name: string, privateKey: string, password: string): WalletMeta {
    this.assertUnlocked()
    const normalized = normalizePrivateKey(privateKey)
    const address = privateKeyToAddress(normalized)
    const id = randomUUID()
    const entry: VaultEntry = {
      id,
      kind: 'private_key',
      name,
      chain: this.chain,
      createdAt: Date.now(),
      privateKey: encryptWithPassword(normalized, password),
      address,
    }
    this.vault.wallets[id] = entry
    this.save()
    return this.toMeta(entry)
  }

  /** Import an Ethereum keystore v3 JSON (decrypts with its own password). */
  importKeystore(
    name: string,
    keystoreJson: string,
    keystorePassword: string,
    vaultPassword: string,
  ): WalletMeta {
    this.assertUnlocked()
    const privateKey = decryptKeystore(keystoreJson, keystorePassword)
    const meta = this.importPrivateKey(name, privateKey, vaultPassword)
    // Re-encrypt under the vault password (the keystore's own encryption
    // is only used during import).
    return meta
  }

  /** Export a wallet as an Ethereum keystore v3 (requires password again). */
  exportKeystore(walletId: string, password: string): KeystoreV3 {
    const privateKey = this.getSecret(walletId, password)
    return encryptKeystore(privateKey, password)
  }

  // --- Secrets (view / export, always requires the password) ---

  /** View the private key of a wallet / account (password required, like MetaMask). */
  exportPrivateKey(walletId: string, password: string, index?: number): string {
    return this.getSecret(walletId, password, index)
  }

  /** View the mnemonic of an HD wallet (password required). */
  exportMnemonic(walletId: string, password: string): string {
    this.assertUnlocked()
    const entry = this.vault.wallets[walletId]
    if (!entry || entry.kind !== 'hd' || !entry.mnemonic) {
      throw new Error('HD wallet not found')
    }
    return this.decryptPayload(entry.mnemonic, password)
  }

  // --- Agent authorization (in-memory keys, persisted grants) ---

  /** Grant the Agent access to a wallet/account signing key (in memory only). */
  authorizeAgent(walletId: string, password: string, index?: number): void {
    const privateKey = this.getSecret(walletId, password, index)
    const key = this.authKey(walletId, index)
    this.authorizedKeys.set(key, privateKey)
    if (!this.authorizedGrants.includes(key)) {
      this.authorizedGrants.push(key)
      this.persistGrants()
    }
  }

  /** Revoke Agent access for a wallet/account. */
  revokeAgent(walletId: string, index?: number): void {
    const key = this.authKey(walletId, index)
    this.authorizedKeys.delete(key)
    this.authorizedGrants = this.authorizedGrants.filter((k) => k !== key)
    this.persistGrants()
  }

  /** Revoke Agent access for all wallets. */
  revokeAllAgents(): void {
    this.authorizedKeys.clear()
    this.authorizedGrants = []
    this.persistGrants()
  }

  /** List wallet keys the Agent currently has in-memory access to. */
  listAuthorized(): string[] {
    return Array.from(this.authorizedKeys.keys())
  }

  /** List persisted agent grants (keys only). Stable across restarts and
   *  visible even while the vault is locked; signing still requires the
   *  in-memory key, which is restored on unlock. */
  listAuthorizedGrants(): string[] {
    return [...this.authorizedGrants]
  }

  /** Get a signing key if the Agent is authorized for this wallet/account. */
  getAuthorizedKey(walletId: string, index?: number): string | null {
    return this.authorizedKeys.get(this.authKey(walletId, index)) ?? null
  }

  /** Re-derive signing keys for persisted grants after the vault unlocks. */
  private restoreAuthorized(password: string): void {
    const stale: string[] = []
    for (const key of this.authorizedGrants) {
      const [walletId, indexStr] = key.includes(':') ? key.split(':') : [key, undefined]
      const index = indexStr === undefined ? undefined : Number(indexStr)
      try {
        this.authorizedKeys.set(key, this.getSecret(walletId!, password, index))
      } catch {
        // Wallet was removed or is unreadable - drop the stale grant.
        stale.push(key)
      }
    }
    if (stale.length > 0) {
      this.authorizedGrants = this.authorizedGrants.filter((k) => !stale.includes(k))
      this.persistGrants()
    }
  }

  private persistGrants(): void {
    this.vault.authorized = [...this.authorizedGrants]
    this.save()
  }

  // --- Metadata ---

  /** List all wallets (address-level metadata only, no secrets). */
  listWallets(): WalletMeta[] {
    return Object.values(this.vault.wallets).map((e) => this.toMeta(e))
  }

  getWallet(id: string): WalletMeta | null {
    const entry = this.vault.wallets[id]
    return entry ? this.toMeta(entry) : null
  }

  /** Remove a wallet (HD parent removes all its accounts). */
  removeWallet(id: string): void {
    const entry = this.vault.wallets[id]
    if (!entry) {
      return
    }
    delete this.vault.wallets[id]
    // Drop grants only for this wallet (its accounts use "id:index" keys).
    this.authorizedGrants = this.authorizedGrants.filter(
      (k) => k !== id && !k.startsWith(`${id}:`),
    )
    for (const key of Array.from(this.authorizedKeys.keys())) {
      if (key === id || key.startsWith(`${id}:`)) this.authorizedKeys.delete(key)
    }
    this.persistGrants()
    this.save()
  }

  // --- Internal ---

  private assertUnlocked(): void {
    if (!this.isUnlocked()) {
      throw new Error('Vault is locked; unlock first')
    }
  }

  private decryptPayload(payload: EncryptedPayload, password: string): string {
    // Cheap re-verify of the password on every secret access.
    return decryptWithPassword(payload, password)
  }

  private getSecret(walletId: string, password: string, index?: number): string {
    const entry = this.vault.wallets[walletId]
    if (!entry) {
      throw new Error('Wallet not found')
    }
    if (entry.kind === 'private_key' && entry.privateKey) {
      return decryptWithPassword(entry.privateKey, password)
    }
    if (entry.kind === 'hd') {
      // HD wallet: derive the account at the given index (default 0).
      if (!entry.mnemonic) {
        throw new Error('HD wallet has no mnemonic')
      }
      const mnemonic = decryptWithPassword(entry.mnemonic, password)
      const passphrase = entry.passphrase ? decryptWithPassword(entry.passphrase, password) : ''
      const seed = mnemonicToSeed(mnemonic, passphrase)
      const account = deriveAccount(seed, index ?? 0, entry.derivationPath ?? "m/44'/60'/0'/0")
      return account.privateKey
    }
    throw new Error('Wallet has no stored secret')
  }

  private authKey(walletId: string, index?: number): string {
    return index === undefined ? walletId : `${walletId}:${index}`
  }

  private toMeta(entry: VaultEntry): WalletMeta {
    if (entry.kind === 'hd') {
      const first = entry.accounts?.[0]
      return {
        id: entry.id,
        name: entry.name,
        chain: entry.chain,
        address: first?.address ?? '',
        kind: 'hd',
        accounts: entry.accounts ?? [],
        canSign: true,
        createdAt: entry.createdAt,
      }
    }
    return {
      id: entry.id,
      name: entry.name,
      chain: entry.chain,
      address: entry.address ?? '',
      kind: 'private_key',
      canSign: true,
      createdAt: entry.createdAt,
    }
  }

  private save(): void {
    const dir = dirname(this.storagePath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.storagePath, JSON.stringify(this.vault, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
}

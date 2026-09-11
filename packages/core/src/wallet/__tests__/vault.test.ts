/**
 * Wallet vault tests.
 *
 * Covers the encryption roundtrip, HD derivation determinism, geth
 * keystore compatibility, and the full vault lifecycle (password
 * gating, in-memory agent authorization, persistence).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  decryptWithPassword,
  encryptWithPassword,
  verifyPassword,
} from '../crypto'
import {
  deriveAccounts,
  generateMnemonicPhrase,
  isValidMnemonic,
  privateKeyToAddress,
} from '../hd'
import { decryptKeystore, encryptKeystore } from '../keystore'
import { VaultWalletManager } from '../WalletManager'

function tempVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-vault-'))
  return join(dir, 'vault.json')
}

describe('vault crypto', () => {
  it('encrypts and decrypts with the same password', () => {
    const payload = encryptWithPassword('secret material 42', 'correct horse')
    expect(payload.data).not.toContain('secret')
    expect(decryptWithPassword(payload, 'correct horse')).toBe('secret material 42')
  })

  it('fails with a wrong password', () => {
    const payload = encryptWithPassword('top secret', 'right')
    expect(() => decryptWithPassword(payload, 'wrong')).toThrow()
    expect(verifyPassword(payload, 'wrong')).toBe(false)
    expect(verifyPassword(payload, 'right')).toBe(true)
  })
})

describe('HD derivation', () => {
  it('generates a valid 24-word mnemonic', () => {
    const mnemonic = generateMnemonicPhrase(256)
    expect(mnemonic.split(' ')).toHaveLength(24)
    expect(isValidMnemonic(mnemonic)).toBe(true)
  })

  it('derives deterministic addresses from a mnemonic', () => {
    // Well-known BIP39 test vector (addresses from the seed).
    const mnemonic =
      'test test test test test test test test test test test junk'
    const accounts = deriveAccounts(mnemonic, 3)
    expect(accounts[0]!.address).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    )
    expect(accounts[1]!.address).toBe(
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    )
    expect(accounts[2]!.address).toBe(
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
    )
  })

  it('derives different accounts when a passphrase is used', () => {
    const mnemonic =
      'test test test test test test test test test test test junk'
    const plain = deriveAccounts(mnemonic, 1)[0]!
    const salted = deriveAccounts(mnemonic, 1, 'my-salt')[0]!
    expect(salted.address).not.toBe(plain.address)
    expect(salted.address).toMatch(/^0x[0-9a-f]{40}$/)
  })

  it('derives the correct address from a private key', () => {
    const privateKey =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    // Known test vector: address #2 of the standard test mnemonic.
    expect(privateKeyToAddress(privateKey)).toBe(
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    )
  })
})

describe('geth keystore compatibility', () => {
  it('round-trips a private key through keystore v3', () => {
    const privateKey =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    const ks = encryptKeystore(privateKey, 'keystore-password')
    expect(ks.version).toBe(3)
    expect(ks.crypto.kdf).toBe('scrypt')
    expect(ks.address).toBe(privateKeyToAddress(privateKey).slice(2))
    expect(decryptKeystore(ks, 'keystore-password')).toBe(privateKey)
  })

  it('rejects a wrong keystore password', () => {
    const ks = encryptKeystore(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      'right',
    )
    expect(() => decryptKeystore(ks, 'wrong')).toThrow()
  })
})

describe('VaultWalletManager', () => {
  it('creates an HD wallet, unlocks, and derives more accounts', () => {
    const path = tempVault()
    const manager = new VaultWalletManager(path)
    manager.load()
    manager.unlock('master-password')

    const created = manager.createHdWallet('Trader', 'master-password', {
      accountCount: 2,
      passphrase: 'extra-salt',
    })
    expect(created.mnemonic.split(' ')).toHaveLength(24)
    expect(created.wallet.kind).toBe('hd')
    expect(created.wallet.accounts).toHaveLength(2)
    expect(created.wallet.address).toMatch(/^0x[0-9a-f]{40}$/)

    const more = manager.deriveMoreAccounts(created.wallet.id, 1, 'master-password')
    expect(more).toHaveLength(1)
    expect(manager.listWallets()[0]!.accounts).toHaveLength(3)
  })

  it('gates secret access behind the password', () => {
    const manager = new VaultWalletManager(tempVault())
    manager.load()
    manager.unlock('pw')
    const { wallet, mnemonic } = manager.createHdWallet('Safe', 'pw')

    expect(() => manager.exportMnemonic(wallet.id, 'wrong-pw')).toThrow()
    expect(() => manager.exportPrivateKey(wallet.id, 'wrong-pw')).toThrow()
    expect(manager.exportMnemonic(wallet.id, 'pw')).toBe(mnemonic)
    expect(manager.exportPrivateKey(wallet.id, 'pw')).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('authorizes the agent in memory only', () => {
    const manager = new VaultWalletManager(tempVault())
    manager.load()
    manager.unlock('pw')
    const { wallet } = manager.createHdWallet('Bot', 'pw', { accountCount: 2 })

    expect(manager.listAuthorized()).toHaveLength(0)
    manager.authorizeAgent(wallet.id, 'pw', 1)
    expect(manager.listAuthorized()).toContain(`${wallet.id}:1`)
    expect(manager.getAuthorizedKey(wallet.id, 1)).toMatch(/^0x[0-9a-f]{64}$/)
    expect(manager.getAuthorizedKey(wallet.id, 0)).toBeNull()

    manager.revokeAgent(wallet.id, 1)
    expect(manager.getAuthorizedKey(wallet.id, 1)).toBeNull()

    // Locking clears the cache.
    manager.authorizeAgent(wallet.id, 'pw')
    manager.lock()
    expect(manager.listAuthorized()).toHaveLength(0)
    expect(manager.isUnlocked()).toBe(false)
  })

  it('persists and reloads the vault from disk', () => {
    const path = tempVault()
    const manager = new VaultWalletManager(path)
    manager.load()
    manager.unlock('pw')
    const { wallet } = manager.createHdWallet('Persisted', 'pw')
    manager.importPrivateKey('Imported', 
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', 'pw')

    const reloaded = new VaultWalletManager(path)
    reloaded.load()
    expect(reloaded.listWallets()).toHaveLength(2)
    expect(() => reloaded.exportMnemonic(wallet.id, 'pw')).toThrow(
      /locked/,
    )
    reloaded.unlock('pw')
    expect(reloaded.exportMnemonic(wallet.id, 'pw')).toBeDefined()
    // Wrong password still rejected after reload.
    expect(() => reloaded.exportMnemonic(wallet.id, 'nope')).toThrow()
  })

  it('imports a private key and exports a keystore', () => {
    const manager = new VaultWalletManager(tempVault())
    manager.load()
    manager.unlock('pw')
    const privateKey =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    const meta = manager.importPrivateKey('Key1', privateKey, 'pw')
    expect(meta.address).toBe(privateKeyToAddress(privateKey))

    const ks = manager.exportKeystore(meta.id, 'pw')
    expect(decryptKeystore(ks, 'pw')).toBe(privateKey)

    // Round-trip: import the keystore back as a new wallet.
    const imported = manager.importKeystore('Key1-copy', JSON.stringify(ks), 'pw', 'pw')
    expect(imported.address).toBe(meta.address)
  })
})

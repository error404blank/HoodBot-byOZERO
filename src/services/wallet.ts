import * as crypto from "crypto";
import { ethers } from "ethers";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** Derive an AES key from user PIN + telegram ID + stored salt */
async function deriveKey(
  pin: string,
  telegramId: string,
  saltHex: string
): Promise<Buffer> {
  const salt = Buffer.from(saltHex, "hex");
  const password = `${pin}:${telegramId}`;
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/** Encrypt a private key with AES-256-GCM */
export async function encryptPrivateKey(
  privateKey: string,
  pin: string,
  telegramId: string
): Promise<{ encryptedKey: string; iv: string; salt: string }> {
  const saltBuf = crypto.randomBytes(SALT_LEN);
  const salt = saltBuf.toString("hex");
  const key = await deriveKey(pin, telegramId, salt);
  const ivBuf = crypto.randomBytes(IV_LEN);
  const iv = ivBuf.toString("hex");

  const cipher = crypto.createCipheriv(ALGORITHM, key, ivBuf);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const encryptedKey = Buffer.concat([encrypted, authTag]).toString("hex");

  return { encryptedKey, iv, salt };
}

/** Decrypt a private key */
export async function decryptPrivateKey(
  encryptedKey: string,
  iv: string,
  salt: string,
  pin: string,
  telegramId: string
): Promise<string> {
  const key = await deriveKey(pin, telegramId, salt);
  const ivBuf = Buffer.from(iv, "hex");
  const encryptedBuf = Buffer.from(encryptedKey, "hex");

  // Last 16 bytes are auth tag
  const authTag = encryptedBuf.subarray(encryptedBuf.length - 16);
  const ciphertext = encryptedBuf.subarray(0, encryptedBuf.length - 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Invalid PIN or corrupted key data");
  }
}

/** Generate a brand new Ethereum wallet */
export function generateWallet(): {
  address: string;
  privateKey: string;
  mnemonic: string;
} {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase ?? "",
  };
}

/** Restore a wallet from private key */
export function walletFromPrivateKey(privateKey: string): {
  address: string;
  privateKey: string;
} {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(normalized);
  return { address: wallet.address, privateKey: wallet.privateKey };
}

/** Restore a wallet from mnemonic */
export function walletFromMnemonic(mnemonic: string): {
  address: string;
  privateKey: string;
} {
  const wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  return { address: wallet.address, privateKey: wallet.privateKey };
}

/** Hash a PIN with SHA-256 for DB storage (only for PIN change checks) */
export function hashPin(pin: string, telegramId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${pin}:${telegramId}`)
    .digest("hex");
}

/** Validate PIN format: exactly 6 digits */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Validate Ethereum address */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Validate private key hex */
export function isValidPrivateKey(key: string): boolean {
  const normalized = key.startsWith("0x") ? key.slice(2) : key;
  return /^[0-9a-fA-F]{64}$/.test(normalized);
}

/** Shorten an address for display: 0x1234...abcd */
export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

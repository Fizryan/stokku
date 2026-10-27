import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16
const MAX_MEM = 32 * 1024 * 1024

function deriveScryptKey(
  password: string,
  salt: Buffer,
  costN: number,
  blockSizeR: number,
  parallelizationP: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: costN,
        r: blockSizeR,
        p: parallelizationP,
        maxmem: MAX_MEM,
      },
      (err, derivedKey) => {
        if (err) {
          reject(err)
          return
        }
        resolve(derivedKey)
      },
    )
  })
}

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await deriveScryptKey(plainPassword, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(
  plainPassword: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const costN = Number.parseInt(parts[1] ?? '', 10)
  const blockSizeR = Number.parseInt(parts[2] ?? '', 10)
  const parallelizationP = Number.parseInt(parts[3] ?? '', 10)
  const saltHex = parts[4]
  const expectedHex = parts[5]

  if (
    !Number.isInteger(costN) ||
    !Number.isInteger(blockSizeR) ||
    !Number.isInteger(parallelizationP) ||
    !saltHex ||
    !expectedHex
  ) {
    return false
  }

  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expectedBuffer = Buffer.from(expectedHex, 'hex')
    if (salt.length === 0 || expectedBuffer.length !== KEY_LENGTH) {
      return false
    }

    const actualBuffer = await deriveScryptKey(
      plainPassword,
      salt,
      costN,
      blockSizeR,
      parallelizationP,
    )
    return timingSafeEqual(actualBuffer, expectedBuffer)
  } catch {
    return false
  }
}

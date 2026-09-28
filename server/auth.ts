import { hash, verify } from "@node-rs/argon2";
import crypto from "crypto";

// Argon2id configuration (recommended by OWASP)
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2, // iterations
  outputLen: 32, // 32 bytes
  parallelism: 1,
};

/**
 * Hash a password using argon2id
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against its hash
 * @param hashedPassword - The stored hash
 * @param plainPassword - The password to verify
 * @returns True if password matches
 */
export async function verifyPassword(
  hashedPassword: string,
  plainPassword: string
): Promise<boolean> {
  try {
    return await verify(hashedPassword, plainPassword, ARGON2_OPTIONS);
  } catch (error) {
    // Invalid hash format or verification error
    return false;
  }
}

/**
 * Validate password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a secure random token for password reset
 * @returns A cryptographically secure random token
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a reset token for secure storage
 */
export async function hashResetToken(token: string): Promise<string> {
  return hash(token, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

/**
 * Verify a reset token against its hash
 */
export async function verifyResetToken(hash: string, token: string): Promise<boolean> {
  try {
    return await verify(hash, token);
  } catch {
    return false;
  }
}

/**
 * Generate a password reset token expiration date
 * @param hoursValid - Number of hours the token is valid (default: 1)
 * @returns Expiration date
 */
export function getResetTokenExpiration(hoursValid: number = 1): Date {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + hoursValid);
  return expiration;
}

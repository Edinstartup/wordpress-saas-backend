import { randomBytes } from 'crypto';

/**
 * Generate a unique API key for site authentication.
 * Format: wsm_<32 random hex characters>
 * Example: wsm_a1b2c3d4e5f6789012345678abcdef01
 */
export function generateApiKey(): string {
  const randomHex = randomBytes(16).toString('hex'); // 32 hex characters
  return `wsm_${randomHex}`;
}

/**
 * Validate API key format.
 * Must be wsm_ followed by exactly 32 hex characters.
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return /^wsm_[a-f0-9]{32}$/.test(apiKey);
}

/**
 * generate-vapid-keys.mjs
 *
 * Generates a VAPID key pair (EC P-256) using the Web Crypto API built into
 * Node.js 18+.  Run once and store the output in environment variables:
 *
 *   VITE_VAPID_PUBLIC_KEY  — add to your Vite / Vercel project env vars
 *   VAPID_PRIVATE_KEY      — add as a Supabase Edge Function secret
 *
 * Usage:
 *   node scripts/generate-vapid-keys.mjs
 */

const { subtle } = globalThis.crypto;

const keyPair = await subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey', 'deriveBits'],
);

// Export public key as uncompressed point (65 bytes) → base64url
const publicKeyRaw = await subtle.exportKey('raw', keyPair.publicKey);
const publicKeyB64 = Buffer.from(publicKeyRaw).toString('base64url');

// Export private key as PKCS8 DER → base64url (used only server-side)
const privateKeyPkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);
const privateKeyB64 = Buffer.from(privateKeyPkcs8).toString('base64url');

console.log('\n=== VAPID Keys Generated ===\n');
console.log('Add the PUBLIC key to your Vite / Vercel project environment variables:');
console.log(`  VITE_VAPID_PUBLIC_KEY=${publicKeyB64}\n`);
console.log('Add the PRIVATE key as a Supabase Edge Function secret (never expose this):');
console.log(`  VAPID_PRIVATE_KEY=${privateKeyB64}\n`);
console.log('Also set your sender identity as a secret:');
console.log('  VAPID_SUBJECT=mailto:you@yourdomain.com\n');
console.log('=== Copy the values above — they will not be shown again ===\n');

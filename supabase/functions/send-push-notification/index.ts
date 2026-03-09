/**
 * send-push-notification — Supabase Edge Function
 *
 * Triggered by a Database Webhook on the `orders` table (INSERT event).
 * Fetches all push subscriptions for the shop, signs and delivers a Web Push
 * message to each endpoint, and removes stale/expired subscriptions (410 Gone).
 *
 * Required Edge Function secrets:
 *   VAPID_PRIVATE_KEY   — base64url-encoded PKCS8 private key
 *   VAPID_SUBJECT       — mailto: or https: URI identifying the sender
 *   SUPABASE_URL        — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY_B64 = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@cohortix.app';

// ─── Base64url helpers ────────────────────────────────────────────────────────

function base64urlToUint8(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function uint8ToBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── VAPID JWT signing (ES256 over P-256) ────────────────────────────────────

async function importVapidPrivateKey(): Promise<CryptoKey> {
  const pkcs8Bytes = base64urlToUint8(VAPID_PRIVATE_KEY_B64);
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

async function buildVapidJwt(audience: string, privateKey: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = uint8ToBase64url(
    new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  );
  const payload = uint8ToBase64url(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signatureRaw = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${uint8ToBase64url(new Uint8Array(signatureRaw))}`;
}

// ─── Push delivery ───────────────────────────────────────────────────────────

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendPush(
  sub: PushSubscription,
  payload: string,
  privateKey: CryptoKey,
  vapidPublicKeyB64: string,
): Promise<{ stale: boolean }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience, privateKey);

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'TTL': '86400',
    Authorization: `vapid t=${jwt},k=${vapidPublicKeyB64}`,
    Urgency: 'high',
  };

  // Encrypt the payload using Web Push encryption (RFC 8291 / RFC 8188)
  const encrypted = await encryptPayload(payload, sub.p256dh, sub.auth);
  headers['Content-Encoding'] = 'aes128gcm';
  headers['Content-Length'] = String(encrypted.byteLength);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers,
    body: encrypted,
  });

  // 410 Gone or 404 means the subscription was unregistered — safe to remove
  if (res.status === 410 || res.status === 404) return { stale: true };
  return { stale: false };
}

// ─── RFC 8291 payload encryption ────────────────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string,
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();

  // Import subscriber public key (uncompressed P-256 point, raw)
  const subscriberPublicKey = await crypto.subtle.importKey(
    'raw',
    base64urlToUint8(p256dhB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );

  // Generate ephemeral sender key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPublicKey },
    senderKeyPair.privateKey,
    256,
  );

  const authSecret = base64urlToUint8(authB64);
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey),
  );
  const subscriberPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', subscriberPublicKey),
  );

  // HKDF PRK from shared secret + auth secret (RFC 8291 §3.3)
  const prkKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, [
    'deriveBits',
  ]);

  // ikm = HKDF-Extract(auth, sharedSecret) with info = "WebPush: info\0" + receiverPub + senderPub
  const infoBuffer = concat(
    enc.encode('WebPush: info\x00'),
    subscriberPublicKeyRaw,
    senderPublicKeyRaw,
  );
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: infoBuffer },
    prkKey,
    256,
  );

  // Generate random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);

  // Content Encryption Key (16 bytes)
  const cekInfo = concat(enc.encode('Content-Encoding: aes128gcm\x00'));
  const cek = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo },
    ikmKey,
    128,
  );

  // Nonce (12 bytes)
  const nonceInfo = concat(enc.encode('Content-Encoding: nonce\x00'));
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo },
    ikmKey,
    96,
  );

  // Encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const paddedPlaintext = concat(enc.encode(plaintext), new Uint8Array([2])); // delimiter
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPlaintext,
  );

  // RFC 8188 aes128gcm content header:
  // salt (16) + record_size (4, big-endian uint32) + key_id_len (1) + sender_pub_key (65)
  const recordSize = new DataView(new ArrayBuffer(4));
  recordSize.setUint32(0, 4096, false);

  const header = concat(
    salt,
    new Uint8Array(recordSize.buffer),
    new Uint8Array([senderPublicKeyRaw.length]),
    senderPublicKeyRaw,
  );

  return concat(header, new Uint8Array(ciphertext)).buffer;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Allow health-check GET
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400 });
  }

  // The webhook payload has the shape: { type, table, record, old_record, schema }
  const record = (body.record ?? body) as Record<string, unknown>;

  // Build a human-readable notification from the order record
  const orderNumber = record.order_number ?? record.orderNumber ?? '—';
  const customerName = record.customer_name ?? record.customerName ?? 'Customer';
  const total = record.total != null ? `Rs ${record.total}` : '';
  const items: Array<{ quantity?: number; name?: string }> = Array.isArray(record.items)
    ? (record.items as Array<{ quantity?: number; name?: string }>)
    : [];
  const itemCount = items.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

  const notificationPayload = JSON.stringify({
    title: 'New Order Received',
    body: [
      `#${orderNumber} — ${customerName}`,
      itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : null,
      total,
    ]
      .filter(Boolean)
      .join(' | '),
    data: {
      orderId: record.id,
      orderNumber,
      url: '/?tab=queue',
    },
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `order-${record.id}`,
    renotify: true,
  });

  // Service-role client — bypasses RLS so we can read all subscriptions
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const shopId = (record.shop_id as string | undefined) ?? 'main';
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('shop_id', shopId);

  if (error) {
    console.error('[push] Failed to fetch subscriptions:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Derive VAPID public key (base64url of raw EC point) for Authorization header
  const privateKeyBytes = base64urlToUint8(VAPID_PRIVATE_KEY_B64);
  const tempKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
  // Re-derive public key from private ECDH key
  const jwk = await crypto.subtle.exportKey('jwk', tempKey);
  // jwk.x and jwk.y are the public key coordinates; reconstruct raw uncompressed point
  const x = base64urlToUint8(jwk.x!);
  const y = base64urlToUint8(jwk.y!);
  const rawPublicKey = new Uint8Array(65);
  rawPublicKey[0] = 0x04;
  rawPublicKey.set(x, 1);
  rawPublicKey.set(y, 33);
  const vapidPublicKeyB64 = uint8ToBase64url(rawPublicKey);

  const privateKey = await importVapidPrivateKey();

  const staleIds: string[] = [];
  let sent = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const { stale } = await sendPush(sub, notificationPayload, privateKey, vapidPublicKeyB64);
        if (stale) {
          staleIds.push(sub.id);
        } else {
          sent++;
        }
      } catch (err) {
        console.error('[push] Delivery failed for', sub.id, err);
      }
    }),
  );

  // Clean up expired subscriptions
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', staleIds);
    if (deleteError) {
      console.error('[push] Failed to remove stale subscriptions:', deleteError.message);
    }
  }

  return new Response(
    JSON.stringify({ sent, stale: staleIds.length, total: subscriptions.length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

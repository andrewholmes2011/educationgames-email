const encoder = new TextEncoder();

const PBKDF2_ITERATIONS = 100_000;
const MAX_SUPPORTED_PBKDF2_ITERATIONS = 100_000;
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 200;

function toHex(value: Uint8Array): string {
  return [...value].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return new Uint8Array(value.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
}

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(data);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error("Password must be between 4 and 200 characters.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltHex, expectedHex, ...extra] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationsText || !saltHex || !expectedHex || extra.length) {
    return false;
  }

  const iterations = Number(iterationsText);
  const salt = fromHex(saltHex);
  const expected = fromHex(expectedHex);

  // Cloudflare Workers Web Crypto supports at most 100,000 PBKDF2 iterations.
  // Reject unsupported or malformed stored parameters before deriving anything.
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_SUPPORTED_PBKDF2_ITERATIONS ||
    !salt ||
    salt.length !== 16 ||
    !expected ||
    expected.length !== 32
  ) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  // Copy into an ArrayBuffer-backed view; Cloudflare Workers types require an ArrayBuffer BufferSource.
  const saltBuffer = new ArrayBuffer(salt.length);
  new Uint8Array(saltBuffer).set(salt);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
    key,
    256
  ));

  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
}

export function validDistrictCode(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,19}$/.test(value);
}

export function validStudentUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,30}$/.test(value);
}

export const EMAIL_DOMAIN = "commga.com";

export function validCommgaAddress(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,30}@commga\.com$/i.test(value);
}

export function validSiteAddress(value: string): boolean {
  return validCommgaAddress(value);
}

export function cleanFilename(value: string): string {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 150) || "attachment";
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

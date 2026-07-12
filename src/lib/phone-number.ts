/// Normalizes a phone number to E.164 (e.g. "+447418008279") for Twilio,
/// which rejects anything else. Assumes UK numbers when no country code is
/// given, since that's this product's primary market. Returns null if the
/// input can't be confidently normalized, so callers can fail clearly
/// instead of sending a malformed number to the provider.
export function normalizePhoneToE164(rawPhone: string): string | null {
  const trimmed = rawPhone.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");

  // UK national format: 0XXXXXXXXXX (11 digits, leading 0) -- e.g. mobile
  // numbers typed the way a UK customer would naturally write them.
  if (digitsOnly.startsWith("0") && digitsOnly.length === 11) {
    return `+44${digitsOnly.slice(1)}`;
  }

  // UK country code without the leading "+".
  if (digitsOnly.startsWith("44") && digitsOnly.length === 12) {
    return `+${digitsOnly}`;
  }

  // UK mobile missing both the leading 0 and the country code.
  if (digitsOnly.length === 10 && digitsOnly.startsWith("7")) {
    return `+44${digitsOnly}`;
  }

  // Unrecognized shape -- best effort, but only if it's plausibly a full
  // international number already.
  return digitsOnly.length >= 8 ? `+${digitsOnly}` : null;
}

// Builds contact links only when the stored value is valid. Nothing is sent:
// links merely open the user's own e-mail client or WhatsApp.

export function mailtoLink(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? `mailto:${e}` : null;
}

export function whatsappLink(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(v)) {
    try {
      return new URL(v).toString();
    } catch {
      return null;
    }
  }
  const digits = v.replace(/\D/g, "");
  // E.164 without "+": 10–15 digits. Brazilian numbers need country code 55.
  if (digits.length < 12 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

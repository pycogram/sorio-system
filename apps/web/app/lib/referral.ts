"use client";

const REF_KEY = "sorio_invite";

// Call once on app load. If the URL has ?invite=<code>, persist it so it
// survives until the user acts. Doesn't overwrite an existing one (first wins).
export function captureRefFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    // Codes are short alphanumeric (we use 8 chars). Sanity-bound the length.
    if (code && /^[a-z0-9]{4,16}$/i.test(code)) {
      if (!localStorage.getItem(REF_KEY)) {
        localStorage.setItem(REF_KEY, code);
      }
    }
  } catch {
    /* ignore storage errors */
  }
}

// Read the stored invite code (or null).
export function getStoredRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function clearStoredRef() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(REF_KEY); } catch {}
}
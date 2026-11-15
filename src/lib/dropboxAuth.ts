/**
 * Dropbox sign-in "mit Code": Dropbox shows a code after the sign-in instead of returning to Merkora
 * (PKCE without redirect address). Works on every device – useful on the phone or if the return fails.
 * Pure – tested in scripts/test-srs.mts.
 */
export function dropboxCodeUrl(appKey: string, challenge: string): string {
  const u = new URL('https://www.dropbox.com/oauth2/authorize');
  u.search = new URLSearchParams({
    client_id: appKey.trim(),
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
  }).toString();
  return u.toString();
}

/** Does pasted text look like a complete Dropbox code? (then Merkora connects without another tap) */
export function looksLikeDropboxCode(s: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(s.trim());
}

/** The body for exchanging the shown code (no redirect address, as in the request). */
export function dropboxCodeBody(appKey: string, code: string, verifier: string): URLSearchParams {
  return new URLSearchParams({ code: code.trim(), grant_type: 'authorization_code', client_id: appKey.trim(), code_verifier: verifier });
}

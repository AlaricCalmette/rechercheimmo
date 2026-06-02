export const AUTH_COOKIE = "auth";

const SALT = "rechercheimmo:v1";

// Jeton déposé dans le cookie d'accès au site : un hash du mot de passe,
// pour ne pas stocker le mot de passe en clair et empêcher une forgerie
// simple sans connaître SITE_PASSWORD. (Web Crypto -> compatible edge + node.)
export async function expectedToken(): Promise<string> {
  const pw = process.env.SITE_PASSWORD ?? "";
  const data = new TextEncoder().encode(SALT + pw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Patterns that match private / link-local / loopback IP ranges and known
// internal hostnames. Used to block SSRF attacks on webhook registration —
// we don't want our worker making requests to AWS metadata, localhost, or
// any internal network on behalf of a developer.
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,          // loopback
  /^0\.0\.0\.0$/,
  /^10\.\d+\.\d+\.\d+$/,            // RFC-1918 class A
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,  // RFC-1918 class B
  /^192\.168\.\d+\.\d+$/,           // RFC-1918 class C
  /^169\.254\.\d+\.\d+$/,           // link-local (AWS/GCP/Azure metadata)
  /^::1$/,                          // IPv6 loopback
  /^fc00:/i,                        // IPv6 unique-local
  /^fe80:/i,                        // IPv6 link-local
];

export function isPrivateHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return BLOCKED_HOSTS.some((p) => p.test(hostname));
  } catch {
    return true;
  }
}

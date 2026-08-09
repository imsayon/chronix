import dns from "node:dns/promises";
import net from "node:net";
import type { LookupAddress } from "node:dns";
import { AppError } from "../../common/errors/AppError.js";

export class SsrfBlockedError extends AppError {
  constructor(reason: string) {
    super("SSRF_BLOCKED", `Target URL is blocked: ${reason}`, 422);
  }
}

const blockedAddresses = new net.BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export function isIpBlocked(ip: string, family = net.isIP(ip)): boolean {
  if (family === 4) return blockedAddresses.check(ip, "ipv4");
  if (family === 6) {
    const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
    return mappedIpv4 === undefined
      ? blockedAddresses.check(ip, "ipv6")
      : blockedAddresses.check(mappedIpv4, "ipv4");
  }
  return true;
}

/**
 * Validate a target at write time. Delivery performs the same validation while
 * pinning the selected address, because this advisory check alone cannot stop
 * DNS rebinding.
 */
export type HostResolver = (hostname: string) => Promise<readonly LookupAddress[]>;

const systemResolver: HostResolver = (hostname) => dns.lookup(hostname, { all: true });

export async function advisorySsrfCheck(
  rawUrl: string,
  resolveHostname: HostResolver = systemResolver,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Protocol not allowed; use HTTP or HTTPS.");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new SsrfBlockedError("Embedded credentials are not allowed.");
  }

  const literalFamily = net.isIP(url.hostname);
  if (literalFamily !== 0) {
    if (isIpBlocked(url.hostname, literalFamily)) {
      throw new SsrfBlockedError("Address is in a blocked network range.");
    }
    return;
  }

  let addresses: readonly LookupAddress[];
  try {
    addresses = await resolveHostname(url.hostname);
  } catch {
    throw new SsrfBlockedError("Hostname could not be resolved.");
  }
  if (addresses.length === 0) {
    throw new SsrfBlockedError("Hostname could not be resolved.");
  }
  if (addresses.some(({ address, family }) => isIpBlocked(address, family))) {
    throw new SsrfBlockedError("Hostname resolves to a blocked network range.");
  }
}

import http from "node:http";
import https from "node:https";
import { isIPv4 } from "node:net";
import { checkServerIdentity } from "node:tls";

const productionHostnames = new Set(["nexusnxs.com", "www.nexusnxs.com"]);
const addressCache = new Map();
const fallbackNotices = new Set();
const dnsProviders = [
  {
    name: "Cloudflare",
    url: (hostname) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
  },
  {
    name: "Google",
    url: (hostname) => `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  },
];

function timeoutSignal(signal) {
  const timeout = AbortSignal.timeout(10_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function isDnsLookupFailure(error) {
  const dnsCodes = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"]);
  let current = error;
  while (current && typeof current === "object") {
    if (dnsCodes.has(current.code)) return true;
    current = current.cause;
  }
  return false;
}

async function queryDnsProvider(provider, hostname, { fetchImpl, signal }) {
  const response = await fetchImpl(provider.url(hostname), {
    headers: { accept: "application/dns-json" },
    signal: timeoutSignal(signal),
  });
  if (!response.ok) {
    throw new Error(`${provider.name} DoH returned ${response.status}.`);
  }
  const payload = await response.json();
  const addresses = (payload.Answer ?? [])
    .filter((answer) => answer.type === 1 && isIPv4(answer.data))
    .map((answer) => answer.data);
  if (payload.Status !== 0 || payload.AD !== true || addresses.length === 0) {
    throw new Error(`${provider.name} did not return a DNSSEC-validated A record for ${hostname}.`);
  }
  return new Set(addresses);
}

export async function resolveDnssecIpv4(hostname, { fetchImpl = fetch, signal } = {}) {
  if (!productionHostnames.has(hostname)) {
    throw new Error(`Trusted DNS fallback is not allowed for ${hostname}.`);
  }
  const answers = await Promise.all(
    dnsProviders.map((provider) => queryDnsProvider(provider, hostname, { fetchImpl, signal })),
  );
  const consensus = [...answers[0]].filter((address) => answers.every((set) => set.has(address)));
  if (consensus.length === 0) {
    throw new Error(`Public DNSSEC resolvers disagree about ${hostname}; verification stopped.`);
  }
  return consensus;
}

export function directFetchViaAddress(input, init = {}, address) {
  const url = new URL(input);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body != null || !["GET", "HEAD"].includes(method)) {
    throw new Error("Trusted direct verification supports only GET and HEAD requests without a body.");
  }

  const headers = new Headers(init.headers);
  headers.set("host", url.host);
  const requestOptions = {
    hostname: address,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method,
    headers: Object.fromEntries(headers),
    signal: init.signal,
  };
  const transport = url.protocol === "https:" ? https : http;
  if (url.protocol === "https:") {
    Object.assign(requestOptions, {
      servername: url.hostname,
      rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(url.hostname, certificate),
    });
  }

  return new Promise((resolveResponse, rejectResponse) => {
    const request = transport.request(requestOptions, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        }
        resolveResponse(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      });
    });
    request.on("error", rejectResponse);
    request.end();
  });
}

async function fetchThroughAddresses(url, init, addresses, directFetchImpl) {
  const errors = [];
  for (const address of addresses) {
    try {
      return await directFetchImpl(url, init, address);
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, `Unable to verify ${url.hostname} through its DNSSEC-validated addresses.`);
}

export async function fetchWithTrustedDns(input, init = {}, dependencies = {}) {
  const url = new URL(input);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  if (!productionHostnames.has(url.hostname)) return fetchImpl(url, init);

  const cache = dependencies.cache ?? addressCache;
  const directFetchImpl = dependencies.directFetchImpl ?? directFetchViaAddress;
  let addresses = cache.get(url.hostname);
  if (!addresses) {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      if (!isDnsLookupFailure(error)) throw error;
      const resolveImpl = dependencies.resolveImpl ?? resolveDnssecIpv4;
      addresses = await resolveImpl(url.hostname, { fetchImpl, signal: init.signal });
      cache.set(url.hostname, addresses);
      if (!fallbackNotices.has(url.hostname)) {
        fallbackNotices.add(url.hostname);
        console.warn(`Local DNS failed for ${url.hostname}; using DNSSEC-validated public DoH consensus.`);
      }
    }
  }
  return fetchThroughAddresses(url, init, addresses, directFetchImpl);
}

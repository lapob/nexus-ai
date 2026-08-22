import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWithTrustedDns,
  isDnsLookupFailure,
  resolveDnssecIpv4,
} from "../scripts/trusted-dns-fetch.mjs";

test("recognizes only DNS lookup failures", () => {
  assert.equal(isDnsLookupFailure(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } })), true);
  assert.equal(isDnsLookupFailure({ cause: { cause: { code: "EAI_AGAIN" } } }), true);
  assert.equal(isDnsLookupFailure(new Error("certificate rejected")), false);
});

test("requires DNSSEC-valid consensus from public DoH resolvers", async () => {
  const responses = [
    { Status: 0, AD: true, Answer: [{ type: 1, data: "104.21.52.127" }, { type: 1, data: "172.67.199.59" }] },
    { Status: 0, AD: true, Answer: [{ type: 1, data: "172.67.199.59" }, { type: 1, data: "203.0.113.9" }] },
  ];
  let call = 0;
  const fetchImpl = async () => Response.json(responses[call++]);
  assert.deepEqual(await resolveDnssecIpv4("nexusnxs.com", { fetchImpl }), ["172.67.199.59"]);

  const insecureFetch = async () => Response.json({ Status: 0, AD: false, Answer: [{ type: 1, data: "203.0.113.9" }] });
  await assert.rejects(resolveDnssecIpv4("nexusnxs.com", { fetchImpl: insecureFetch }), /DNSSEC-validated/);
  await assert.rejects(resolveDnssecIpv4("ai.nexusnxs.com", { fetchImpl }), /not allowed/);
});

test("falls back only after local DNS failure and preserves the verified hostname", async () => {
  const dnsFailure = new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
  const calls = [];
  const response = await fetchWithTrustedDns("https://nexusnxs.com/security", { headers: { accept: "text/html" } }, {
    cache: new Map(),
    fetchImpl: async () => { throw dnsFailure; },
    resolveImpl: async (hostname) => {
      assert.equal(hostname, "nexusnxs.com");
      return ["104.21.52.127"];
    },
    directFetchImpl: async (url, init, address) => {
      calls.push({ url: url.href, accept: new Headers(init.headers).get("accept"), address });
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(await response.text(), "ok");
  assert.deepEqual(calls, [{
    url: "https://nexusnxs.com/security",
    accept: "text/html",
    address: "104.21.52.127",
  }]);

  await assert.rejects(fetchWithTrustedDns("https://nexusnxs.com/", {}, {
    cache: new Map(),
    fetchImpl: async () => { throw new Error("certificate rejected"); },
    resolveImpl: async () => { throw new Error("must not resolve"); },
  }), /certificate rejected/);
});

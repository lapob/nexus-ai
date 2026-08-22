import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const CLOUDFLARE_ACCOUNT_ID = "7d844e420d105a64adc45a165e4cd8f6";
export const CLOUDFLARE_TOKEN_NAME = "nexusnxs-release";

const keyringService = "NexusNXS Cloudflare Release";
const keyringAccount = `${CLOUDFLARE_TOKEN_NAME}:${CLOUDFLARE_ACCOUNT_ID}`;

export function assertAccountToken(token) {
  const normalized = token?.trim();
  if (!/^cfat_[A-Za-z0-9_-]{20,}$/.test(normalized ?? "")) {
    throw new Error("Expected a Cloudflare account-owned API token beginning with cfat_.");
  }
  return normalized;
}

async function entry(EntryClass) {
  if (EntryClass) return new EntryClass(keyringService, keyringAccount);
  let keyring;
  try {
    keyring = await import("@napi-rs/keyring");
  } catch (error) {
    throw new Error(
      "The OS credential backend is unavailable. Run npm ci on a supported system or provide CLOUDFLARE_API_TOKEN only for this release process.",
      { cause: error },
    );
  }
  return new keyring.Entry(keyringService, keyringAccount);
}

export async function readStoredAccountToken({ EntryClass } = {}) {
  const stored = (await entry(EntryClass)).getPassword();
  return stored ? assertAccountToken(stored) : null;
}

export async function resolveAccountToken({ env = process.env, EntryClass } = {}) {
  const fromEnvironment = env.CLOUDFLARE_API_TOKEN?.trim();
  if (fromEnvironment) return assertAccountToken(fromEnvironment);
  const stored = await readStoredAccountToken({ EntryClass });
  if (stored) return stored;
  throw new Error(
    "Cloudflare release credential missing. Run npm run cloudflare:credential:store or provide CLOUDFLARE_API_TOKEN to this process.",
  );
}

export async function storeAccountToken(token, { EntryClass } = {}) {
  (await entry(EntryClass)).setPassword(assertAccountToken(token));
}

async function readSecret() {
  if (!process.stdin.isTTY) {
    let value = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) value += chunk;
    return value.trim();
  }

  if (typeof process.stdin.setRawMode !== "function") {
    throw new Error("A hidden terminal prompt is unavailable. Provide the token through standard input.");
  }

  process.stdout.write("Cloudflare account token (input hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolveSecret, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Credential storage cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolveSecret(value);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const action = process.argv[2];
  if (action === "store") {
    await storeAccountToken(await readSecret());
    console.log(`Cloudflare credential stored in the OS keyring as ${CLOUDFLARE_TOKEN_NAME}.`);
    return;
  }
  if (action === "status") {
    const configured = Boolean(await readStoredAccountToken());
    console.log(`Cloudflare account credential: ${configured ? "configured" : "missing"}.`);
    process.exitCode = configured ? 0 : 1;
    return;
  }
  throw new Error("Use store or status.");
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();

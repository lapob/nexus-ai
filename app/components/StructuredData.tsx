"use client";

import { useCspNonce } from "./CspNonceContext";

export function StructuredData({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const nonce = useCspNonce();
  return <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

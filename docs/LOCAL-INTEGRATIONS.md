# Local MCP and n8n integrations

Connections are disabled until the owner configures them. The public web AI and
paired phones cannot invoke the generic integration action. The local desktop
planner and existing workflow runtime share `run_integration`, one-use approval,
receipts, cancellation and interrupted-step recovery. Even full-access mode
requires explicit approval for this critical action.

The adapter uses the official MCP client SDK pinned in the lockfile. It supports
Streamable HTTP tools; it does not grant sampling, roots, elicitation, shell
commands, downloaded plugin code or authority from server instructions. n8n uses
one configured webhook. This release admits only literal `127.0.0.1` HTTP
endpoints, with no DNS, URL credentials, redirects, automatic retries or cloud
connection. A remote connection needs a separate reviewed transport policy.

## Owner configuration

Create `integrations.json` in the existing private application data directory;
never commit that file or credentials. Start from a disabled definition:

```json
{
  "connections": [{
    "id": "local-workflow",
    "type": "n8n",
    "enabled": false,
    "url": "http://127.0.0.1:5678/webhook/owner-workflow",
    "authEnv": "NEXUS_INTEGRATION_WORKFLOW",
    "tools": ["trigger"]
  }]
}
```

For MCP, use `type: "mcp"`, the exact local MCP endpoint and a bounded list of
tool names. The referenced owner-controlled environment secret must contain
32–2048 characters without newlines. Both adapters send it as a bearer token to
the exact configured endpoint. Configure matching authentication on the local
service, inspect its workflow/tool permissions, then enable the definition.
No service, workflow, credentials or paid account is provisioned automatically.

After restarting the app, Settings → Connections lists enabled connections and
offers persistent revocation. Revocation aborts local in-flight requests; it
cannot undo effects already performed by another process. Changing configuration
or rotating the token invalidates pending approval. A call is capped at30seconds,
16KiB of input and256KiB of output, with one active call per connection.

`accepted-unverified` means n8n accepted the request. `tool-returned-unverified`
means an MCP tool returned a result. Neither proves external effects succeeded.
Inspect the workflow/tool's final state before retrying an uncertain operation.
Disabling a connection is durable; it is not automatically re-enabled by discovery.

## Validation

Source tests exercise the official SDK negotiation, tool allowlists, local-only
authority, approval consumption, changed configuration, persistent revocation,
cancellation, output limits and refusal to retry uncertain requests. These are
isolated fixtures, not evidence that an owner's n8n/MCP service is connected.

Protocol references: [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0),
[n8n Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/).

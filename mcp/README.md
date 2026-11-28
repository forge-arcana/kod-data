# keppet-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for **Keppet Open Data** —
free, daily, USD-anchored data for the world's currencies, precious metals, crypto, reference
rates and sovereign yield curves.

Zero dependencies. No API key. It is a thin typed wrapper over the public CDN
(`forge-arcana/kod-data` via jsDelivr): every tool is a static GET, and `convert` does the
USD-anchor math so your agent gets a number instead of a URL and a formula.

## Run

```bash
npx keppet-mcp
```

or clone and run directly (Node ≥ 18):

```bash
node mcp/server.mjs
```

The server speaks newline-delimited JSON-RPC 2.0 over stdio — point any MCP client at it.

## Configure an MCP client

**Claude Desktop / Claude Code** (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "keppet": {
      "command": "npx",
      "args": ["-y", "keppet-mcp"]
    }
  }
}
```

Optional env var `KOD_CDN` overrides the base URL (e.g. to pin a commit SHA for reproducible
results instead of `@main`).

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_datasets` | — | Every dataset: unit, count, latest date, sources (discovery entry point). |
| `convert` | `from`, `to`, `amount?` | Cross-rate + converted amount between **any** two instruments, across domains. |
| `get_fx` | `symbols?` | FX rates, per USD. |
| `get_metals` | `symbols?` | Metal spot prices, USD per troy ounce (XAU/XAG/XPT/XPD). |
| `get_crypto` | `symbols?` | Crypto prices, USD. |
| `get_rates` | — | Reference + policy interest rates, percent p.a. |
| `get_yield_curve` | `country?` | Sovereign yield curve (tenor → yield); defaults to US. |

## How `convert` works

Every value is anchored to USD, so any cross-rate is one division:

```
value_of_X_in_Y = usd_value(X) / usd_value(Y)
```

`usd_value` is how many USD one unit is worth: for fiat it's `1 / rate` (rates are quoted per
USD), for price domains (metals, crypto) it's the price itself, and USD is `1`. The server
resolves an instrument across fx → metals → crypto automatically, so `convert("BTC","JPY")`
or `convert("XAU","EUR")` just work.

## Notes

- Responses are cached in-process for 5 minutes — a burst of agent calls collapses to one
  network hit without serving stale data (the feeds update at most a few times a day).
- Tool failures come back as `isError` content (e.g. an unknown symbol), so the agent can
  recover rather than seeing a transport error.
- Data licensing and source attribution follow the upstream feeds; see the main project README.

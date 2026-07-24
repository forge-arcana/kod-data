#!/usr/bin/env node
// keppet-mcp — a Model Context Protocol server for Keppet Open Data.
//
// Zero dependencies, no API key. It is a thin typed wrapper over the public CDN: every
// tool is a static GET against forge-arcana/kod-data, and `convert` does the USD-anchor
// math so an agent gets a number instead of a URL and a formula. Stdio transport,
// newline-delimited JSON-RPC 2.0 (per the MCP spec); protocol-level errors go to stderr.
//
// Run: npx keppet-mcp   (or: node server.mjs). Point any MCP client at it via stdio.

import { createInterface } from 'node:readline'

const CDN = process.env.KOD_CDN || 'https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main'
const NAME = 'keppet-mcp'
const VERSION = '1.0.0'
const DEFAULT_PROTOCOL = '2024-11-05'

// --- tiny cached fetch -------------------------------------------------------
// The feeds change at most a few times a day; a short TTL collapses a burst of
// agent calls into one network hit without ever serving genuinely stale data.
const TTL_MS = 5 * 60 * 1000
const cache = new Map() // path -> { at, data }

async function getJson(path) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  const res = await fetch(`${CDN}/${path}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  const data = await res.json()
  cache.set(path, { at: Date.now(), data })
  return data
}

// --- USD anchor --------------------------------------------------------------
// usd_value(X): how many USD one unit of X is worth. Fiat rates are quoted per USD,
// so usd_value = 1/rate; price domains are already in USD, so usd_value = price.
// Resolution precedence fx > metals > crypto (metals also fold into fx identically,
// so the only genuine fallback is crypto). USD is the unit, value 1.
async function usdValue(symRaw) {
  const sym = String(symRaw).toUpperCase().trim()
  if (sym === 'USD') return { sym, usd: 1, domain: 'anchor', date: null }

  const fx = await getJson('fx/v1/usd.min.json')
  if (fx.rates && sym in fx.rates) return { sym, usd: 1 / fx.rates[sym], domain: 'fx', date: fx.date }

  const metals = await getJson('metals/v1/latest.min.json')
  if (metals.prices && sym in metals.prices) return { sym, usd: metals.prices[sym], domain: 'metals', date: metals.date }

  const crypto = await getJson('crypto/v1/latest.min.json')
  if (crypto.prices && sym in crypto.prices) return { sym, usd: crypto.prices[sym], domain: 'crypto', date: crypto.date }

  throw new Error(`unknown instrument "${sym}" — not a known currency, metal (XAU/XAG/XPT/XPD) or crypto symbol`)
}

// Optionally narrow a {key: value} price/rate map to a requested symbol list.
function pick(map, symbols) {
  if (!symbols || !symbols.length) return map
  const want = new Set(symbols.map((s) => String(s).toUpperCase()))
  return Object.fromEntries(Object.entries(map).filter(([k]) => want.has(k.toUpperCase())))
}

// --- tools -------------------------------------------------------------------
const TOOLS = [
  {
    name: 'list_datasets',
    description:
      'List every Keppet dataset with its unit, instrument count, latest effective date and sources. ' +
      'The discovery entry point — call this first to see what is available.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const c = await getJson('catalog.json')
      return { anchor: c.anchor, conversion: c.conversion, updated: c.updated, datasets: c.datasets }
    },
  },
  {
    name: 'convert',
    description:
      'Convert an amount from one instrument to another across ANY domains (fiat currency, precious ' +
      'metal XAU/XAG/XPT/XPD, or crypto symbol) using the USD anchor. Returns the rate and converted amount.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source instrument, e.g. "EUR", "XAU", "BTC", "USD".' },
        to: { type: 'string', description: 'Target instrument, e.g. "JPY", "USD", "ETH".' },
        amount: { type: 'number', description: 'Amount of `from` to convert. Default 1.' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    run: async ({ from, to, amount = 1 }) => {
      const a = await usdValue(from)
      const b = await usdValue(to)
      const rate = a.usd / b.usd
      return {
        from: a.sym,
        to: b.sym,
        amount,
        rate,
        result: amount * rate,
        explanation: `${a.sym}→${to}: usd_value(${a.sym})=${a.usd} / usd_value(${b.sym})=${b.usd}`,
        asOf: { [a.domain]: a.date, [b.domain]: b.date },
      }
    },
  },
  {
    name: 'get_fx',
    description: 'Foreign exchange rates, quoted per USD. Optionally filter to specific currency codes.',
    inputSchema: {
      type: 'object',
      properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'e.g. ["EUR","JPY"]. Omit for all.' } },
      additionalProperties: false,
    },
    run: async ({ symbols } = {}) => {
      const fx = await getJson('fx/v1/usd.min.json')
      return { base: fx.base, unit: fx.unit, date: fx.date, updated: fx.updated, sources: fx.sources, rates: pick(fx.rates || {}, symbols) }
    },
  },
  {
    name: 'get_metals',
    description: 'Precious metal spot prices in USD per troy ounce (XAU gold, XAG silver, XPT platinum, XPD palladium).',
    inputSchema: {
      type: 'object',
      properties: { symbols: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
    run: async ({ symbols } = {}) => {
      const m = await getJson('metals/v1/latest.min.json')
      return { unit: m.unit, date: m.date, updated: m.updated, sources: m.sources, prices: pick(m.prices || {}, symbols) }
    },
  },
  {
    name: 'get_crypto',
    description: 'Cryptocurrency prices in USD. Optionally filter to specific ticker symbols (e.g. BTC, ETH).',
    inputSchema: {
      type: 'object',
      properties: { symbols: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
    run: async ({ symbols } = {}) => {
      const c = await getJson('crypto/v1/latest.min.json')
      return { unit: c.unit, date: c.date, updated: c.updated, sources: c.sources, count: c.count, prices: pick(c.prices || {}, symbols) }
    },
  },
  {
    name: 'get_rates',
    description: 'Reference and policy interest rates in percent per annum (e.g. SOFR, ESTR, central-bank policy rates).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const r = await getJson('rates/v1/latest.min.json')
      return { date: r.date, updated: r.updated, sources: r.sources, reference: r.reference, policy: r.policy }
    },
  },
  {
    name: 'get_yield_curve',
    description: 'Sovereign yield curve — tenor → yield (percent per annum). Defaults to US.',
    inputSchema: {
      type: 'object',
      properties: { country: { type: 'string', description: 'ISO-ish country code, e.g. "US". Default "US".' } },
      additionalProperties: false,
    },
    run: async ({ country = 'US' } = {}) => {
      const y = await getJson('yields/v1/latest.min.json')
      const code = String(country).toUpperCase()
      const curve = (y.curves || {})[code]
      if (!curve) throw new Error(`no yield curve for "${code}" — available: ${Object.keys(y.curves || {}).join(', ') || 'none'}`)
      return { country: code, date: y.date, updated: y.updated, sources: y.sources, unit: curve.unit, tenors: curve.tenors }
    },
  },
]
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

// --- JSON-RPC plumbing -------------------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}
const ok = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

async function handle(msg) {
  const { id, method, params } = msg
  // Notifications (no id) need no reply.
  if (id === undefined || id === null) return

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: NAME, version: VERSION },
        instructions:
          'Keppet Open Data: free USD-anchored FX, metals, crypto, rates and yields. ' +
          'Call list_datasets to discover feeds, convert for any cross-rate.',
      })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
    case 'tools/call': {
      const tool = BY_NAME.get(params?.name)
      if (!tool) return fail(id, -32602, `unknown tool: ${params?.name}`)
      try {
        const data = await tool.run(params.arguments || {})
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
      } catch (e) {
        // Tool-level failure: report via result.isError so the agent can react, not a transport error.
        return ok(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true })
      }
    }
    default:
      return fail(id, -32601, `method not found: ${method}`)
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const s = line.trim()
  if (!s) return
  let msg
  try {
    msg = JSON.parse(s)
  } catch {
    return fail(null, -32700, 'parse error')
  }
  handle(msg).catch((e) => fail(msg?.id ?? null, -32603, `internal error: ${e.message}`))
})

process.stderr.write(`${NAME} ${VERSION} ready on stdio (CDN: ${CDN})\n`)

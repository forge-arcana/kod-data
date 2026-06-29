# Keppet Open Data

Free, daily, USD-anchored open data for the world's currencies, metals, crypto,
reference rates and sovereign yield curves. Official keyless feeds, normalised to
one envelope and committed as static JSON — served globally by
[jsDelivr](https://www.jsdelivr.com/) straight from this repo. No server, no
database, no API key, no rate limits.

## Discovery — one URL to find everything

An agent fetches a single file to learn the whole catalog: every dataset, its CDN
path, unit, cadence, count and sources.

```
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/catalog.json
```

For LLM agents there is also an [`llms.txt`](https://llmstxt.org) — the same catalog
as prose an agent ingests in one read, including the USD-anchor rule:

```
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/llms.txt
```

```json
{
  "name": "Keppet Open Data",
  "anchor": "USD",
  "conversion": "value_of_X_in_Y = usd_value(X) / usd_value(Y); fiat usd_value=1/rate, price-domains usd_value=price",
  "cdn": "https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main",
  "datasets": [
    { "id": "fx", "latest": "fx/v1/usd.min.json", "unit": "per_usd", "count": 158, "...": 0 },
    { "id": "metals", "latest": "metals/v1/latest.min.json", "unit": "usd_per_oz", "count": 4, "...": 0 }
  ]
}
```

## Endpoints

Every dataset has a `latest` (minified + pretty) plus dated snapshots for any past
day. Resolve a path from `catalog.json` or use the patterns directly:

```
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/fx/v1/usd.min.json         # FX — every world currency
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/metals/v1/latest.min.json  # precious metals
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/crypto/v1/latest.min.json  # cryptocurrencies
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/rates/v1/latest.min.json   # reference & policy rates
https://cdn.jsdelivr.net/gh/forge-arcana/kod-data@main/yields/v1/latest.min.json  # sovereign yield curves
```

Variants for each dataset:

```
.../fx/v1/usd.json            # pretty-printed
.../fx/v1/2026-06-26.min.json # any past day (dated snapshot)
```

Raw GitHub works as an uncached fallback with lower limits:

```
https://raw.githubusercontent.com/forge-arcana/kod-data/main/fx/v1/usd.min.json
```

## The canonical envelope

Every dataset shares one shape, so a consumer learns it once:

```json
{
  "$schema": ".../schema/<domain>.schema.json",
  "dataset": "fx",
  "base": "USD",
  "date": "2026-06-26",
  "updated": "2026-06-28T17:25:10.343Z",
  "sources": ["un", "bis", "ecb"],
  "...": "domain payload"
}
```

`date` is the feed's effective date, **not** build time (`updated`). `base` is
always USD.

## Formats per domain

**fx** — `rates[CODE]` is units of CODE per 1 USD; `USD` is the anchor and always `1`.

```json
{ "dataset": "fx", "base": "USD", "date": "2026-06-26",
  "rates": { "EUR": 0.877116, "GBP": 0.756539, "JPY": 161.6525, "XAU": 0.000244, "USD": 1 } }
```

**metals** — USD price of one troy ounce (`base` carries `unit: "troy_ounce"`).

```json
{ "dataset": "metals", "base": "USD", "unit": "troy_ounce", "date": "2026-06-26",
  "prices": { "XAU": 4082.025, "XAG": 58.804, "XPT": 1631.12, "XPD": 1209.495 } }
```

**crypto** — USD price of one coin.

```json
{ "dataset": "crypto", "base": "USD", "date": "2026-06-28", "count": 96,
  "prices": { "BTC": 59574, "ETH": 1567.82, "BNB": 550.49, "ADA": 0.143036 } }
```

**rates** — overnight reference rates and central-bank policy rates, in percent,
each with its own effective `date` and `source`.

```json
{ "dataset": "rates", "date": "2026-06-28",
  "reference": { "SOFR": { "percent": 3.64, "date": "2026-06-25", "source": "nyfed" },
                 "ESTR": { "percent": 2.183, "date": "2026-06-25", "source": "ecb" } },
  "policy": { "BR": { "percent": 14.25, "date": "2026-06-23" },
              "CA": { "percent": 2.25, "date": "2026-06-22" } } }
```

**yields** — sovereign yield curve by tenor, in percent.

```json
{ "dataset": "yields", "base": "USD", "date": "2026-06-26",
  "curves": { "US": { "unit": "percent",
    "tenors": { "3M": 3.83, "2Y": 4.07, "10Y": 4.38, "30Y": 4.87 } } } }
```

## Universal conversion

Because every value is anchored to USD, any cross-domain pair reduces to one formula:

```
value_of_X_in_Y = usd_value(X) / usd_value(Y)
```

where the per-domain `usd_value` is:

- **fiat (fx):** `usd_value = 1 / rates[X]` — `rates[X]` is units of X per USD.
- **price domains (metals, crypto):** `usd_value = price` — USD price of one unit.

### Worked example — gold in EUR

One ounce of gold priced in euros, using `metals.prices.XAU` and `fx.rates.EUR`:

```
usd_value(XAU) = 4082.025          # USD per ounce
usd_value(EUR) = 1 / 0.877116      # USD per euro
XAU_in_EUR = 4082.025 / (1 / 0.877116) = 4082.025 * 0.877116 ≈ 3580.4 EUR/oz
```

### Worked example — BTC in JPY

```
usd_value(BTC) = 59574             # USD per coin
usd_value(JPY) = 1 / 161.6525      # USD per yen
BTC_in_JPY = 59574 * 161.6525 ≈ 9,630,500 JPY
```

The general FX re-anchor (currency X in base B) is the same rule:
`rate of X in B = rates[B] / rates[X]`. Metals are also folded into FX as
currencies (`rates[XAU] = 1 / usd_price`), so gold-in-yen falls straight out of
`rates[B] / rates[X]` with no special case.

## Agents & MCP

The data is agent-ready with zero integration: any LLM with a fetch tool can read
`llms.txt` (or `catalog.json`) and consume every feed directly — the files are
self-describing, including the USD-anchor formula.

For a typed interface, the **`keppet-mcp`** server wraps the feeds as Model Context
Protocol tools (`list_datasets`, `convert`, `get_fx`, `get_metals`, `get_crypto`,
`get_rates`, `get_yield_curve`). It is zero-dependency and keyless — a thin wrapper over
this CDN — and `convert` does the cross-domain USD-anchor math for you:

```json
{
  "mcpServers": {
    "keppet": { "command": "npx", "args": ["-y", "keppet-mcp"] }
  }
}
```

Then an agent can ask `convert(from: "BTC", to: "JPY")` or `convert(from: "XAU", to: "EUR")`
and get a number back. See [`mcp/README.md`](mcp/README.md).

## Sources

All data comes **only from official institutions** — no third-party aggregators,
no scraping where an official table exists — and every feed is **keyless**.

| Domain | Source | Institution |
|---|---|---|
| fx | `un` | [UN Operational Rates of Exchange](https://treasury.un.org/operationalrates/OperationalRates.php) — ~151 currencies, base layer |
| fx | `bis` | [Bank for International Settlements](https://stats.bis.org/) — ~60 currencies, daily |
| fx | `ecb` | [European Central Bank](https://www.ecb.europa.eu/stats/eurofxref/) — euro reference rates, freshest majors |
| fx, metals | `lbma` | [LBMA](https://www.lbma.org.uk/prices-and-data) — London precious-metal benchmarks |
| metals | `swissquote` | [Swissquote](https://www.swissquote.com/) public metals feed |
| crypto | `coingecko` | [CoinGecko](https://www.coingecko.com/) public price API |
| rates | `nyfed` | [Federal Reserve Bank of New York](https://www.newyorkfed.org/markets/reference-rates) — SOFR |
| rates | `ecb` | [ECB](https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/) — €STR |
| rates | `bis` | [BIS](https://www.bis.org/statistics/cbpol.htm) — central-bank policy rates |
| yields | `us-treasury` | [U.S. Treasury](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics) — daily par yield curve |

`payload.sources` records which feeds actually contributed to each build. FX layers
its sources widest-first (UN → BIS → ECB): every currency is present, the majors are
freshest, exotics fall back to the UN's monthly figure.

## Cadence

A scheduled GitHub Action rebuilds daily and commits **only when values change**.
The upstreams publish about once per working day, so most runs are no-ops. If a
feed fails or coverage drops below a sanity floor, the builder **keeps the last
committed file** — a bad upstream day degrades to yesterday's data, never to broken
output. For genuine intraday data a paid market feed would be required — out of
scope for a daily reference API.

## History & archive

Git history is both the time-series archive and the last-good fallback — every
commit is a timestamped snapshot, and `git log` of any path is that dataset's full
revision history. The same observations are published at three temperatures:

- **HOT** — dated JSON snapshots (`<domain>/v1/<date>.min.json`) on the CDN, a rolling
  90-day window.
- **WARM** — tidy long-form observations, one JSON object per line, partitioned by
  effective date and de-duplicated, for in-place DuckDB/Polars queries:
  `archive/observations/year=2026/month=06/<date>.ndjson`. FX, metals, crypto,
  rates and yields all stack into one queryable table.
- **COLD** — an annual roll-up, gzipped NDJSON + Parquet, published as **GitHub
  Release assets** (one tag per year) so the served tree stays lean.

## License

Code: **MIT**. Data is published by each institution under its own terms — the UN,
BIS, ECB, LBMA, Swissquote, CoinGecko, the New York Fed and the U.S. Treasury as
attributed above. Use the data subject to those institutions' respective licenses.
</content>
</invoke>

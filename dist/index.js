#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("./api");
const config_1 = require("./config");
const formatter_1 = require("./formatter");
const DEFAULT_LIMIT = 20;
function printUsage() {
    console.log(`supermarket-deals

Search German supermarket flyers for product deals via Marktguru.
Results are ranked by best price per litre.

Usage:
  supermarket-deals search <query> [--zip <PLZ>] [--stores <list>] [--limit <n>] [--json]
  supermarket-deals config
  supermarket-deals config set <zip|stores> <value>

Options:
  --zip <PLZ>       Postal code to search (default: from config)
  --stores <list>   Comma-separated store filter, e.g. "Lidl,REWE,EDEKA"
  --limit <n>       Max results to show (default: ${DEFAULT_LIMIT})
  --json            Output raw JSON

Examples:
  supermarket-deals search "Monster Energy" --zip 85540
  supermarket-deals search "Coca Cola Zero" --zip 80331 --stores "Lidl,ALDI SÜD"
  supermarket-deals search "Haribo" --limit 5
  supermarket-deals config set zip 85540
  supermarket-deals config set stores "Lidl,REWE,EDEKA,ALDI SÜD,Kaufland"
`);
}
function parseArgs(argv) {
    const [commandRaw, ...rest] = argv;
    if (!commandRaw || ["-h", "--help", "help"].includes(commandRaw)) {
        printUsage();
        process.exit(0);
    }
    if (!["search", "config"].includes(commandRaw)) {
        throw new Error(`Unknown command: ${commandRaw}. Run with --help for usage.`);
    }
    if (commandRaw === "config") {
        if (rest[0] === "set") {
            const key = rest[1];
            const value = rest.slice(2).join(" ").trim();
            if (!key || !value) {
                throw new Error("Usage: supermarket-deals config set <zip|stores> <value>");
            }
            return { command: "config", limit: DEFAULT_LIMIT, asJson: false, queries: [], configSet: { key, value } };
        }
        return { command: "config", limit: DEFAULT_LIMIT, asJson: false, queries: [] };
    }
    const queries = [];
    let zip;
    let stores;
    let limit = DEFAULT_LIMIT;
    let asJson = false;
    for (let i = 0; i < rest.length; i += 1) {
        const token = rest[i];
        if (token === "--zip") {
            zip = rest[++i];
            continue;
        }
        if (token === "--stores") {
            stores = (0, config_1.parseCsvStores)(rest[++i]);
            continue;
        }
        if (token === "--limit") {
            const n = Number(rest[++i]);
            if (!Number.isFinite(n) || n <= 0)
                throw new Error("--limit must be a positive number");
            limit = Math.min(Math.floor(n), 100);
            continue;
        }
        if (token === "--json") {
            asJson = true;
            continue;
        }
        if (token.startsWith("--"))
            throw new Error(`Unknown option: ${token}`);
        queries.push(token);
    }
    if (queries.length === 0) {
        printUsage();
        process.exit(0);
    }
    return { command: "search", queries, zip, stores, limit, asJson };
}
function dedupeDeals(deals) {
    const seen = new Set();
    return deals.filter((deal) => {
        if (seen.has(deal.id))
            return false;
        seen.add(deal.id);
        return true;
    });
}
function filterByStores(deals, stores) {
    if (!stores || stores.length === 0)
        return deals;
    const wanted = stores.map((s) => s.toLowerCase());
    return deals.filter((deal) => wanted.some((s) => deal.store.toLowerCase().includes(s)));
}
async function performSearch(params) {
    let totalRawResults = 0;
    const allMapped = [];
    for (const query of params.queries) {
        const response = await (0, api_1.searchOffers)(query, params.zip, params.limit * 2);
        totalRawResults += response.totalResults;
        for (const offer of response.results) {
            allMapped.push((0, formatter_1.mapOfferToDeal)(offer, query));
        }
    }
    const deduped = dedupeDeals(allMapped);
    const filtered = filterByStores(deduped, params.stores);
    const sorted = filtered.sort((a, b) => {
        if (a.pricePerLitre === null)
            return 1;
        if (b.pricePerLitre === null)
            return -1;
        return a.pricePerLitre - b.pricePerLitre;
    });
    return { deals: sorted.slice(0, params.limit), totalRawResults };
}
async function runSearch(args) {
    const cfg = await (0, config_1.loadConfig)();
    const queries = args.queries.map((q) => q.trim());
    const zip = args.zip || cfg.defaultZip;
    const stores = args.stores && args.stores.length > 0 ? args.stores : cfg.defaultStores;
    const { deals, totalRawResults } = await performSearch({ queries, zip, stores, limit: args.limit });
    if (args.asJson) {
        console.log((0, formatter_1.formatDealsJson)(deals, { queries, zip, stores, totalRawResults, resultCount: deals.length }));
        return;
    }
    console.log(`Queries: ${queries.join(", ")} | ZIP: ${zip} | Stores: ${stores.join(", ")}`);
    console.log(`Found ${deals.length} deal(s) (${totalRawResults} total from API), ranked by EUR/L\n`);
    console.log((0, formatter_1.formatDealsTable)(deals));
}
async function runConfig(args) {
    const cfg = await (0, config_1.loadConfig)();
    if (!args.configSet) {
        console.log(JSON.stringify({ configPath: (0, config_1.getConfigPath)(), config: cfg }, null, 2));
        return;
    }
    const { key, value } = args.configSet;
    if (key === "zip") {
        cfg.defaultZip = value.trim();
    }
    else if (key === "stores") {
        const parsed = (0, config_1.parseCsvStores)(value);
        if (!parsed || parsed.length === 0)
            throw new Error("stores must be a comma-separated list");
        cfg.defaultStores = parsed;
    }
    else if (key === "reset") {
        Object.assign(cfg, (0, config_1.defaults)());
    }
    else {
        throw new Error("Supported config keys: zip, stores, reset");
    }
    await (0, config_1.saveConfig)(cfg);
    console.log(JSON.stringify({ configPath: (0, config_1.getConfigPath)(), config: cfg }, null, 2));
}
async function main() {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.command === "search")
            await runSearch(args);
        else
            await runConfig(args);
    }
    catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
void main();

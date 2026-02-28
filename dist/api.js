"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchOffers = searchOffers;
exports.sanitizeOfferId = sanitizeOfferId;
exports.getKeysPath = getKeysPath;
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const MARKTGURU_HOME = "https://www.marktguru.de";
const SEARCH_ENDPOINT = "https://api.marktguru.de/api/v1/offers/search";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = node_path_1.default.join(node_os_1.default.homedir(), ".supermarket-deals");
const KEYS_PATH = node_path_1.default.join(CACHE_DIR, "keys.json");
async function ensureCacheDir() {
    await (0, promises_1.mkdir)(CACHE_DIR, { recursive: true });
}
async function readCachedKeys() {
    try {
        const raw = await (0, promises_1.readFile)(KEYS_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed.apiKey || !parsed.clientKey || !parsed.fetchedAt) {
            return null;
        }
        if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
async function saveKeys(keys) {
    await ensureCacheDir();
    await (0, promises_1.writeFile)(KEYS_PATH, `${JSON.stringify(keys, null, 2)}\n`, "utf8");
}
function extractKeysFromHtml(html) {
    const scriptRegex = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const content = match[1]?.trim();
        if (!content) {
            continue;
        }
        try {
            const parsed = JSON.parse(content);
            const apiKey = parsed.config?.apiKey;
            const clientKey = parsed.config?.clientKey;
            if (apiKey && clientKey) {
                return { apiKey, clientKey };
            }
        }
        catch {
            // Ignore malformed JSON blocks and continue scanning.
        }
    }
    throw new Error("Could not extract API keys from marktguru homepage JSON config.");
}
async function fetchFreshKeys() {
    const response = await fetch(MARKTGURU_HOME, {
        headers: {
            Accept: "text/html"
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch Marktguru homepage: HTTP ${response.status}`);
    }
    const html = await response.text();
    const keys = extractKeysFromHtml(html);
    const full = {
        ...keys,
        fetchedAt: Date.now()
    };
    await saveKeys(full);
    return full;
}
async function getKeys(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = await readCachedKeys();
        if (cached) {
            return cached;
        }
    }
    try {
        return await fetchFreshKeys();
    }
    catch (firstError) {
        // Graceful fallback: retry once before failing.
        try {
            return await fetchFreshKeys();
        }
        catch {
            throw firstError;
        }
    }
}
const MAX_QUERY_LENGTH = 100;
const MAX_LIMIT = 100;
const ZIP_REGEX = /^\d{4,6}$/;
function validateInputs(query, zipCode, limit) {
    if (!query || query.trim().length === 0) {
        throw new Error("Query must not be empty.");
    }
    if (query.length > MAX_QUERY_LENGTH) {
        throw new Error(`Query too long (max ${MAX_QUERY_LENGTH} characters).`);
    }
    if (!ZIP_REGEX.test(zipCode)) {
        throw new Error(`Invalid ZIP code: "${zipCode}". Expected 4–6 digits.`);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new Error(`Limit must be an integer between 1 and ${MAX_LIMIT}.`);
    }
}
function sanitizeOfferId(id) {
    if (id == null)
        return null;
    const str = String(id).trim();
    // Only allow numeric IDs to prevent URL injection
    return /^\d+$/.test(str) ? str : null;
}
function buildSearchUrl(query, zipCode, limit) {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("as", "web");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("q", query);
    url.searchParams.set("zipCode", zipCode);
    return url;
}
async function searchOffers(query, zipCode, limit) {
    validateInputs(query, zipCode, limit);
    const run = async (forceRefreshKeys) => {
        const keys = await getKeys(forceRefreshKeys);
        const url = buildSearchUrl(query, zipCode, limit);
        const response = await fetch(url, {
            headers: {
                "x-apikey": keys.apiKey,
                "x-clientkey": keys.clientKey,
                Accept: "application/json"
            }
        });
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`Marktguru search failed: HTTP ${response.status} ${body.slice(0, 200)}`.trim());
        }
        const raw = await response.json();
        if (typeof raw !== "object" || raw === null) {
            throw new Error("Unexpected Marktguru response: not an object.");
        }
        if (!Array.isArray(raw["results"])) {
            throw new Error("Unexpected Marktguru response: results is not an array.");
        }
        return {
            totalResults: typeof raw["totalResults"] === "number" ? raw["totalResults"] : 0,
            results: raw["results"],
        };
    };
    try {
        return await run(false);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
            return run(true);
        }
        throw error;
    }
}
function getKeysPath() {
    return KEYS_PATH;
}

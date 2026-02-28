"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureConfigDir = ensureConfigDir;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.getConfigPath = getConfigPath;
exports.parseCsvStores = parseCsvStores;
exports.defaults = defaults;
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_CONFIG = {
    defaultZip: "85540",
    defaultStores: ["Aldi", "Lidl", "REWE", "EDEKA", "ALDI SÜD", "ALDI NORD", "Kaufland"],
};
const CONFIG_DIR = node_path_1.default.join(node_os_1.default.homedir(), ".supermarket-deals");
const CONFIG_PATH = node_path_1.default.join(CONFIG_DIR, "config.json");
function normalizeConfig(raw) {
    const source = raw ?? {};
    return {
        defaultZip: typeof source.defaultZip === "string" && source.defaultZip.trim() ? source.defaultZip.trim() : DEFAULT_CONFIG.defaultZip,
        defaultStores: Array.isArray(source.defaultStores) && source.defaultStores.length > 0
            ? source.defaultStores.map((s) => String(s).trim()).filter(Boolean)
            : [...DEFAULT_CONFIG.defaultStores],
    };
}
async function ensureConfigDir() {
    await (0, promises_1.mkdir)(CONFIG_DIR, { recursive: true });
}
async function loadConfig() {
    await ensureConfigDir();
    try {
        const data = await (0, promises_1.readFile)(CONFIG_PATH, "utf8");
        const parsed = JSON.parse(data);
        return normalizeConfig(parsed);
    }
    catch {
        await saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
    }
}
async function saveConfig(config) {
    await ensureConfigDir();
    await (0, promises_1.writeFile)(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
function getConfigPath() {
    return CONFIG_PATH;
}
function parseCsvStores(input) {
    if (!input) {
        return undefined;
    }
    const values = input
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    return values.length > 0 ? values : undefined;
}
function defaults() {
    return { ...DEFAULT_CONFIG };
}

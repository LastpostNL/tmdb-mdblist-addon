require('dotenv').config();
const express = require("express");
const cors = require("cors");
const favicon = require('serve-favicon');
const path = require("path");
const addon = express();

// ─── CORS ───────────────────────────────────────────────────────────────────────
// Sta alle origins, methods en headers toe (verwijder dubbele of onjuiste blokken)
addon.use(cors());
addon.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── STATISCHE BESTANDEN & ANALYTICS ─────────────────────────────────────────────
const analytics = require('./utils/analytics');
addon.use(analytics.middleware);
addon.use(favicon(path.join(__dirname, '../public/favicon.png')));
addon.use(express.static(path.join(__dirname, '../public')));
addon.use(express.static(path.join(__dirname, '../dist')));

// ─── LIB IMPORTS ────────────────────────────────────────────────────────────────
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { blurImage } = require('./utils/imageProcessor');
const { getMDBLists } = require('./lib/getMDBList');

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const getCacheHeaders = function (opts) {
  opts = opts || {};
  if (!Object.keys(opts).length) return false;
  const cacheHeaders = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };
  return Object.entries(cacheHeaders)
    .map(([prop, header]) => {
      const val = opts[prop];
      return val ? `${header}=${val}` : false;
    })
    .filter(Boolean)
    .join(", ");
};

const respond = function (res, data, opts) {
  const cacheControl = getCacheHeaders(opts);
  if (cacheControl) res.setHeader("Cache-Control", `${cacheControl}, public`);
  // CORS-headers al gezet via middleware
  res.setHeader("Content-Type", "application/json");
  res.send(data);
};

// ─── ROUTES ────────────────────────────────────────────────────────────────────
addon.get("/", (_, res) => res.redirect("/configure"));

addon.get("/request_token", async (req, res) => {
  const token = await getRequestToken();
  respond(res, token);
});

addon.get("/session_id", async (req, res) => {
  const sid = await getSessionId(req.query.request_token);
  respond(res, sid);
});

addon.use('/configure', express.static(path.join(__dirname, '../dist')));

addon.get('/:catalogChoices?/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

addon.get("/:catalogChoices?/manifest.json", async (req, res) => {
  const config = parseConfig(req.params.catalogChoices);
  const manifest = await getManifest(config);
  respond(res, manifest, {
    cacheMaxAge: 12 * 3600,
    staleRevalidate: 14 * 24 * 3600,
    staleError: 30 * 24 * 3600,
  });
});

addon.get("/:catalogChoices?/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { catalogChoices, type, id, extra } = req.params;
  const config = parseConfig(catalogChoices);
  const language = config.language || DEFAULT_LANGUAGE;
  const sessionId = config.sessionId;
  const rpdbkey = config.rpdbkey;
  const params = extra
    ? Object.fromEntries(new URLSearchParams(extra.slice(0, -5)).entries())
    : {};
  let metas = [];

  try {
    if (params.search) {
      metas = await getSearch(type, language, params.search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          metas = await getTrending(type, language, +params.skip/20+1, params.genre);
          break;
        case "tmdb.favorites":
          metas = await getFavorites(type, language, +params.skip/20+1, params.genre, sessionId);
          break;
        case "tmdb.watchlist":
          metas = await getWatchList(type, language, +params.skip/20+1, params.genre, sessionId);
          break;
        default:
metas = await getCatalog({
  id,
  extraInputs: [
    { name: "skip", value: Number(params.skip || 0) },
    ...(params.genre ? [{ name: "genre", value: params.genre }] : []),
  ],
  config,
});
      }
    }
  } catch {
    return res.status(404).send("Not found");
  }

  // RPDB overlay
  if (rpdbkey) {
    metas = await Promise.all(metas.metas.map(async el => {
      const rpdbImg = getRpdbPoster(type, el.id.replace('tmdb:', ''), language, rpdbkey);
      el.poster = (await checkIfExists(rpdbImg)) ? rpdbImg : el.poster;
      return el;
    }));
  }
  respond(res, metas, {
    cacheMaxAge: 24 * 3600,
    staleRevalidate: 7 * 24 * 3600,
    staleError: 14 * 24 * 3600,
  });
});

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  // … (ongewijzigd) …
});

// MDBList lijst route
addon.get("/mdblist/lists/user", async (req, res) => {
  const apikey = req.query.apikey;
  if (!apikey) return res.status(400).json({ error: "No apikey provided" });
  try {
    const lists = await getMDBLists(apikey);
    if (!lists.length) return res.status(404).json({ error: "No MDBList lists found" });
    res.json(lists);
  } catch {
    res.status(500).json({ error: "Failed to fetch MDBList lists" });
  }
});

addon.get('/node-version', (req, res) => {
  res.json({ nodeVersion: process.version });
});

module.exports = addon;

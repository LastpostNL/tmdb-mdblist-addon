require('dotenv').config();
const express = require("express");
const cors = require("cors");
const favicon = require('serve-favicon');
const path = require("path");
const addon = express();

// ─── CORS ───────────────────────────────────────────────────────────────────────
addon.use(cors());
addon.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin",  "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
const { getCatalog }     = require("./lib/getCatalog");
const { getSearch }      = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta }        = require("./lib/getMeta");
const { getTmdb }        = require("./lib/getTmdb");
const { cacheWrapMeta }  = require("./lib/getCache");
const { getTrending }    = require("./lib/getTrending");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { getRequestToken, getSessionId }         = require("./lib/getSession");
const { getFavorites, getWatchList }            = require("./lib/getPersonalLists");
const { blurImage }        = require('./utils/imageProcessor');
const { getMDBLists }      = require('./lib/getMDBList');

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function getCacheHeaders(opts = {}) {
  const mapping = {
    cacheMaxAge:     "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError:      "stale-if-error",
  };
  return Object.entries(mapping)
    .map(([opt, header]) => opts[opt] ? `${header}=${opts[opt]}` : false)
    .filter(Boolean)
    .join(", ");
}

function respond(res, data, opts = {}) {
  const cc = getCacheHeaders(opts);
  if (cc) res.setHeader("Cache-Control", `${cc}, public`);
  res.type("application/json").send(data);
}

// ─── ROUTES ────────────────────────────────────────────────────────────────────
// Homepage redirect naar configuratie
addon.get("/", (_, res) => res.redirect("/configure"));

// TMDB OAuth endpoints
addon.get("/request_token", async (req, res) => {
  const token = await getRequestToken();
  respond(res, token);
});
addon.get("/session_id", async (req, res) => {
  const sid = await getSessionId(req.query.request_token);
  respond(res, sid);
});

// Config UI
addon.use('/configure', express.static(path.join(__dirname, '../dist')));
addon.get('/:catalogChoices?/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Manifest
addon.get("/:catalogChoices?/manifest.json", async (req, res) => {
  const config   = parseConfig(req.params.catalogChoices);
  const manifest = await getManifest(config);
  respond(res, manifest, {
    cacheMaxAge:     12 * 3600,
    staleRevalidate: 14 * 24 * 3600,
    staleError:      30 * 24 * 3600,
  });
});

// Catalog zonder extra
addon.get("/:catalogChoices?/catalog/:type/:id.json", async (req, res) => {
  return handleCatalog(req, res, /* extraMode */ false);
});

// Catalog met extra (genre, skip, search)
addon.get("/:catalogChoices?/catalog/:type/:id/:extra.json", async (req, res) => {
  return handleCatalog(req, res, /* extraMode */ true);
});

async function handleCatalog(req, res, extraMode) {
  const { catalogChoices, type, id } = req.params;
  const config     = parseConfig(catalogChoices);
  const language   = config.language || DEFAULT_LANGUAGE;
  const sessionId  = config.sessionId;
  const rpdbkey    = config.rpdbkey;
  let params = {};

  if (extraMode) {
    // extra blijft iets als "skip=20&genre=Action"
    const extra = req.params.extra.replace(/\.json$/, "");
    params = Object.fromEntries(new URLSearchParams(extra).entries());
  }

  let result;
  try {
    if (params.search) {
      result = await getSearch(type, language, params.search, config);
    }
    else if (id === "tmdb.trending") {
      const page = Math.floor((Number(params.skip) || 0) / 20) + 1;
      result = await getTrending(type, language, page, params.genre);
    }
    else if (id === "tmdb.favorites") {
      const page = Math.floor((Number(params.skip) || 0) / 20) + 1;
      result = await getFavorites(type, language, page, params.genre, sessionId);
    }
    else if (id === "tmdb.watchlist") {
      const page = Math.floor((Number(params.skip) || 0) / 20) + 1;
      result = await getWatchList(type, language, page, params.genre, sessionId);
    }
    else {
      // generieke catalogen (popular, top, etc.) en MDBList
      result = await getCatalog({
        id,
        extraInputs: [
          ...(params.skip  ? [{ name:"skip",  value: Number(params.skip)  }] : []),
          ...(params.genre ? [{ name:"genre",value: params.genre }] : []),
          ...(params.search? [{ name:"search",value: params.search}] : []),
        ],
        config
      });
    }
  }
  catch (err) {
    return res.status(404).send(err.message || "Not found");
  }

  // RPDB override
  if (rpdbkey && result.metas) {
    result.metas = await Promise.all(result.metas.map(async m => {
      const tmdbId = m.id.split(":")[1];
      const url    = getRpdbPoster(type, tmdbId, language, rpdbkey);
      m.poster = (await checkIfExists(url)) ? url : m.poster;
      return m;
    }));
  }

  respond(res, result, {
    cacheMaxAge:     24 * 3600,
    staleRevalidate: 7  * 24 * 3600,
    staleError:      14 * 24 * 3600,
  });
}

// Meta endpoint (ongewijzigd t.o.v. origineel)
// … je eigen code hier …

// MDBList user-lists
addon.get("/mdblist/lists/user", async (req, res) => {
  const apikey = req.query.apikey;
  if (!apikey) {
    return res.status(400).json({ error: "No apikey provided" });
  }
  try {
    const lists = await getMDBLists(apikey);
    if (!lists.length) return res.status(404).json({ error: "No MDBList lists found" });
    res.json(lists);
  }
  catch {
    res.status(500).json({ error: "Failed to fetch MDBList lists" });
  }
});

module.exports = addon;

// index.js
require('dotenv').config();
const express = require("express");
const favicon = require('serve-favicon');
const path = require("path");
const addon = express();
const analytics = require('./utils/analytics');
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { getMDBLists, getMDBList } = require("./lib/getMDBList"); // toegevoegd
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { blurImage } = require('./utils/imageProcessor');

// ─── MIDDLEWARES ───────────────────────────────────────────────────────────────
addon.use(analytics.middleware);
addon.use(favicon(path.join(__dirname, '../public/favicon.png')));
addon.use(express.static(path.join(__dirname, '../public')));
addon.use(express.static(path.join(__dirname, '../dist')));

const getCacheHeaders = (opts = {}) => {
  const map = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };
  return Object.entries(map)
    .map(([opt, header]) => opts[opt] ? `${header}=${opts[opt]}` : false)
    .filter(Boolean)
    .join(", ");
};

const respond = (res, data, opts) => {
  const cc = getCacheHeaders(opts);
  if (cc) res.setHeader("Cache-Control", `${cc}, public`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
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

// Serve configure-UI
addon.use('/configure', express.static(path.join(__dirname, '../dist')));
addon.get('/:catalogChoices?/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ─── MDBList-lijsten voor de configuratie ─────────────────────────────────────
addon.get("/mdblist/lists/user", async (req, res) => {
  const apikey = req.query.apikey;
  if (!apikey) return res.status(400).json({ error: "No apikey provided" });
  try {
    const lists = await getMDBLists(apikey);
    if (!lists.length) return res.status(404).json({ error: "No MDBList lists found" });
    res.json(lists);
  } catch (err) {
    console.error("MDBList fetch error:", err);
    res.status(500).json({ error: "Failed to fetch MDBList lists" });
  }
});

// ─── Manifest ─────────────────────────────────────────────────────────────────
addon.get("/:catalogChoices?/manifest.json", async (req, res) => {
  const config = parseConfig(req.params.catalogChoices);
  const manifest = await getManifest(config);
  respond(res, manifest, {
    cacheMaxAge: 12 * 3600,
    staleRevalidate: 14 * 24 * 3600,
    staleError: 30 * 24 * 3600,
  });
});

// ─── Catalogus (TMDB én MDBList) ──────────────────────────────────────────────
addon.get("/:catalogChoices?/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { catalogChoices, type, id, extra } = req.params;
  const config = parseConfig(catalogChoices);
  const language = config.language || DEFAULT_LANGUAGE;
  const sessionId = config.sessionId;
  const rpdbkey = config.rpdbkey;

  // parse extra query params
  const params = extra
    ? Object.fromEntries(new URLSearchParams(extra.slice(0, -5)).entries())
    : {};
  const page = Math.max(1, Math.ceil((params.skip||0)/20) + 1);
  const genre = params.genre;
  const search = params.search;

  try {
    // ── MDBList-catalogus?
    if (id.startsWith("mdblist.")) {
      const { metas, cacheMaxAge } = await getMDBList(type, language, page, id, config);
      return respond(res, { metas }, { cacheMaxAge });
    }

    // ── TMDB-catalogi
    let result;
    if (search) {
      result = await getSearch(type, language, search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          result = await getTrending(type, language, page, genre); break;
        case "tmdb.favorites":
          result = await getFavorites(type, language, page, genre, sessionId); break;
        case "tmdb.watchlist":
          result = await getWatchList(type, language, page, genre, sessionId); break;
        default:
          result = await getCatalog(type, language, page, id, genre, config); break;
      }
    }

    // RPDB overlay
    if (rpdbkey && result.metas) {
      result.metas = await Promise.all(result.metas.map(async el => {
        const rpdbImg = getRpdbPoster(type, el.id.replace("tmdb:", ""), language, rpdbkey);
        el.poster = (await checkIfExists(rpdbImg)) ? rpdbImg : el.poster;
        return el;
      }));
    }

    respond(res, result, {
      cacheMaxAge: 24 * 3600,
      staleRevalidate: 7 * 24 * 3600,
      staleError: 14 * 24 * 3600,
    });
  } catch (err) {
    console.error("Catalog error:", err);
    res.status(404).send(err.message || "Not found");
  }
});

// ─── Meta-data per item ───────────────────────────────────────────────────────
addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  // **kopieer hier ongewijzigd je bestaande meta-route uit de originele addon**
});

// ─── Beeld-blur endpoint ──────────────────────────────────────────────────────
addon.get("/api/image/blur", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: 'No URL provided' });

  try {
    const buf = await blurImage(imageUrl);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buf);
  } catch (err) {
    console.error('Blur error:', err);
    res.status(500).json({ error: 'Failed to blur image' });
  }
});

module.exports = addon;

// addon/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const favicon = require('serve-favicon');
const path = require("path");

const analytics            = require('./utils/analytics');
const { getCatalog }       = require("./lib/getCatalog");
const { getSearch }        = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta }          = require("./lib/getMeta");
const { getTmdb }          = require("./lib/getTmdb");
const { cacheWrapMeta }    = require("./lib/getCache");
const { getTrending }      = require("./lib/getTrending");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { getFavorites, getWatchList }    = require("./lib/getPersonalLists");
const { blurImage }         = require('./utils/imageProcessor');
const { getMDBLists, getMDBList } = require("./lib/getMDBList");

const addon = express();

// CORS vóór alle routes
addon.use(cors());

// Favicon, analytics & statics
addon.use(analytics.middleware);
addon.use(favicon(path.join(__dirname, '../public/favicon.png')));
addon.use(express.static(path.join(__dirname, '../public')));
addon.use(express.static(path.join(__dirname, '../dist')));

// Helper voor cache headers
const getCacheHeaders = function (opts) {
  opts = opts || {};
  if (!Object.keys(opts).length) return false;
  let cacheHeaders = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };
  return Object.keys(cacheHeaders)
    .map((prop) => {
      const value = opts[prop];
      if (!value) return false;
      return cacheHeaders[prop] + "=" + value;
    })
    .filter((val) => !!val)
    .join(", ");
};

const respond = function (res, data, opts) {
  const cacheControl = getCacheHeaders(opts);
  if (cacheControl) res.setHeader("Cache-Control", `${cacheControl}, public`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  res.send(data);
};

// Redirect root naar configuratiepagina
addon.get("/", function (_, res) {
  res.redirect("/configure");
});

// Endpoint om request token op te halen (TMDb login flow)
addon.get("/request_token", async function (req, res) {
  const requestToken = await getRequestToken();
  respond(res, requestToken);
});

// Manifest endpoint met cataloguskeuze parameter
addon.get("/:catalogChoices?/manifest.json", async function (req, res) {
  const { catalogChoices } = req.params;
  const config = parseConfig(catalogChoices);
  const manifest = await getManifest(config);

  const cacheOpts = {
    cacheMaxAge: 12 * 60 * 60,
    staleRevalidate: 14 * 24 * 60 * 60,
    staleError: 30 * 24 * 60 * 60,
  };
  respond(res, manifest, cacheOpts);
});

// --- MDBList: Proxy endpoint om items van een specifieke lijst op te halen ---
addon.get("/lists/:listId/items", async (req, res) => {
  const { listId } = req.params;
  const { apikey } = req.query;

  if (!apikey) {
    return res.status(400).json({ error: "API key missing" });
  }

  const url = `https://api.mdblist.com/lists/${listId}/items?apikey=${apikey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `MDBList API error: ${text}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error proxying MDBList list items:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- MDBList: Endpoint om persoonlijke lijsten van gebruiker op te halen (voor configuratie UI) ---
addon.get("/mdblist/lists/user", async (req, res) => {
  const userToken = req.query.apikey;
  if (!userToken) {
    return res.status(400).json({ error: "API key missing" });
  }
  try {
    const lists = await getMDBLists(userToken);
    res.json(lists);
  } catch (error) {
    console.error("Error fetching MDB lists:", error);
    res.status(500).json({ error: "Failed to fetch MDB lists" });
  }
});

// Endpoint om TMDb session_id op te halen (na login)
addon.get("/session_id", async function (req, res) {
  const requestToken = req.query.request_token;
  const sessionId = await getSessionId(requestToken);
  respond(res, sessionId);
});

// Serveer configuratie UI statische bestanden
addon.use('/configure', express.static(path.join(__dirname, '../dist')));

addon.use('/configure', (req, res, next) => {
  const config = parseConfig(req.params.catalogChoices);
  next();
});

addon.get('/:catalogChoices?/configure', function (req, res) {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// --- Belangrijkste catalogus route, met ondersteuning voor MDBList ---
addon.get("/:catalogChoices?/catalog/:type/:id/:extra?.json", async function (req, res) {
  const { catalogChoices, type, id, extra } = req.params;
  const config = parseConfig(catalogChoices);
  const language = config.language || DEFAULT_LANGUAGE;
  const rpdbkey = config.rpdbkey;
  const sessionId = config.sessionId;

  const queryParams = extra
    ? Object.fromEntries(new URLSearchParams(req.url.split("/").pop().split("?")[0].slice(0, -5)).entries())
    : {};
  const { genre, skip, search } = queryParams;

  const page = Math.ceil(skip ? skip / 20 + 1 : 1);

  let metas = [];

try {
  if (search) {
    metas = await getSearch(type, language, search, config);
  } else {
    // Check of id alleen uit cijfers bestaat => MDBList lijst
    if (/^\d+$/.test(id)) {
      metas = await getMDBList(type, id, page, language, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          metas = await getTrending(type, language, page, genre);
          break;
        case "tmdb.favorites":
          metas = await getFavorites(type, language, page, genre, sessionId);
          break;
        case "tmdb.watchlist":
          metas = await getWatchList(type, language, page, genre, sessionId);
          break;
      case "tmdb.popular":
          console.log("→ GET /catalog", type, id, "page", page);
          metas = await getCatalog(type, language, page, id, genre, config);
          console.log("   → tmdb.popular metas count:", metas.metas.length);
          break;
        default:
          metas = await getCatalog(type, language, page, id, genre, config);
          break;
      }
    }
  }
} catch (e) {
  res.status(404).send((e || {}).message || "Not found");
  return;
}

  // Optionele poster vervanging via RPDB (indien API key aanwezig)
  if (rpdbkey) {
    try {
      metas = JSON.parse(JSON.stringify(metas));
      metas.metas = await Promise.all(
        metas.metas.map(async (el) => {
          const rpdbImage = getRpdbPoster(type, el.id.replace('tmdb:', ''), language, rpdbkey);
          el.poster = (await checkIfExists(rpdbImage)) ? rpdbImage : el.poster;
          return el;
        })
      );
    } catch (e) {
      // fail silently
    }
  }

  const cacheOpts = {
    cacheMaxAge: 1 * 24 * 60 * 60, // 1 dag cache
    staleRevalidate: 7 * 24 * 60 * 60,
    staleError: 14 * 24 * 60 * 60,
  };

  respond(res, metas, cacheOpts);
});

// Meta endpoint (TMDb en IMDb id's ondersteund)
addon.get("/:catalogChoices?/meta/:type/:id.json", async function (req, res) {
  const { catalogChoices, type, id } = req.params;
  const config = parseConfig(catalogChoices);
  const language = config.language || DEFAULT_LANGUAGE;
  const rpdbkey = config.rpdbkey;
  const tmdbId = id.split(":")[1];
  const imdbId = id.split(":")[0];

  if (id.includes("tmdb:")) {
    const resp = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, async () => {
      return await getMeta(type, language, tmdbId, rpdbkey, {
        hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true"
      });
    });
    const cacheOpts = {
      staleRevalidate: 20 * 24 * 60 * 60,
      staleError: 30 * 24 * 60 * 60,
    };
    if (type === "movie") {
      cacheOpts.cacheMaxAge = 14 * 24 * 60 * 60;
    } else if (type === "series") {
      const hasEnded = !!((resp.releaseInfo || "").length > 5);
      cacheOpts.cacheMaxAge = (hasEnded ? 14 : 1) * 24 * 60 * 60;
    }
    respond(res, resp, cacheOpts);
  } else if (id.includes("tt")) {
    const tmdbIdFromImdb = await getTmdb(type, imdbId);
    if (tmdbIdFromImdb) {
      const resp = await cacheWrapMeta(`${language}:${type}:${tmdbIdFromImdb}`, async () => {
        return await getMeta(type, language, tmdbIdFromImdb, rpdbkey, {
          hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true"
        });
      });
      const cacheOpts = {
        staleRevalidate: 20 * 24 * 60 * 60,
        staleError: 30 * 24 * 60 * 60,
      };
      if (type === "movie") {
        cacheOpts.cacheMaxAge = 14 * 24 * 60 * 60;
      } else if (type === "series") {
        const hasEnded = !!((resp.releaseInfo || "").length > 5);
        cacheOpts.cacheMaxAge = (hasEnded ? 14 : 1) * 24 * 60 * 60;
      }
      respond(res, resp, cacheOpts);
    } else {
      res.status(404).send("Not found");
    }
  } else {
    res.status(404).send("Not found");
  }
});

module.exports = addon;

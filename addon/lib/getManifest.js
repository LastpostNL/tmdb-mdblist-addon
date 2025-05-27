require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { getMDBLists } = require("./getMDBList");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "nl-NL";

function generateArrayOfYears(maxYears) {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: maxYears + 1 }, (_, i) => (currentYear - i).toString());
}

function setOrderLanguage(language, languagesArray) {
  const languageObj = languagesArray.find(l => l.iso_639_1 === language);
  if (!languageObj) return languagesArray.map(el => el.name);
  // Verwijder het gevonden element uit de array
  const fromIndex = languagesArray.indexOf(languageObj);
  if (fromIndex > -1) languagesArray.splice(fromIndex, 1);
  // Sorteer alfabetisch
  languagesArray.sort((a, b) => a.name.localeCompare(b.name));
  // Voeg het gevonden element als eerste toe
  languagesArray.unshift(languageObj);
  // Zorg dat namen uniek zijn en return
  return [...new Set(languagesArray.map(el => el.name))];
}

function loadTranslations(language) {
  return {
    ...catalogsTranslations[DEFAULT_LANGUAGE],
    ...(catalogsTranslations[language] || {})
  };
}

function createCatalog(id, type, catalogDef, options, tmdbPrefix, translatedCatalogs, showInHome = false) {
  const extra = [];

  if (catalogDef.extraSupported.includes("genre")) {
    const formatted = (catalogDef.defaultOptions || options).map(opt => {
      if (opt.includes(".")) {
        const [field, order] = opt.split(".");
        return `${translatedCatalogs[field] || field} (${translatedCatalogs[order] || order})`;
      }
      return translatedCatalogs[opt] || opt;
    });
    extra.push({ name: "genre", options: formatted, isRequired: !showInHome });
  }
  if (catalogDef.extraSupported.includes("search")) extra.push({ name: "search" });
  if (catalogDef.extraSupported.includes("skip")) extra.push({ name: "skip" });

  return {
    id,
    type,
    name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs[catalogDef.nameKey]}`,
    pageSize: 20,
    extra
  };
}

function getCatalogDefinition(catalogId) {
  const [, type] = catalogId.split(".");
  return Object.values(CATALOG_TYPES)
    .flatMap(t => Object.values(t))
    .find(def => def.nameKey === type) || null;
}

function getOptionsForCatalog(catalogDef, type, showInHome, { years, genres_movie, genres_series, filterLanguages }) {
  if (catalogDef.defaultOptions) return catalogDef.defaultOptions;

  const baseGenres = type === "movie" ? genres_movie : genres_series;
  const genres = showInHome ? [...baseGenres] : ["Top", ...baseGenres];

  switch (catalogDef.nameKey) {
    case "year":
      return years;
    case "language":
      return filterLanguages;
    default:
      return genres;
  }
}

async function getMDBListItems(listId, apiKey) {
  try {
    const res = await fetch(`https://api.mdblist.com/lists/${listId}/items?apikey=${apiKey}`);
    if (!res.ok) throw new Error(`Failed to fetch list items for ${listId}: ${res.statusText}`);
    const data = await res.json();
    return {
      hasMovies: Array.isArray(data.movies) && data.movies.length > 0,
      hasShows: Array.isArray(data.shows) && data.shows.length > 0
    };
  } catch (err) {
    console.error(err);
    return { hasMovies: false, hasShows: false };
  }
}

async function getManifest(config) {
  config.catalogs = (config.catalogs || getDefaultCatalogs()).map(c => ({ ...c, enabled: c.enabled !== false }));
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;

  // Normaliseer MDBList catalogs: vervang oude "mdblist." prefix door puur lijst-ID als string
  if (Array.isArray(config.catalogs) && Array.isArray(config.mdblistLists)) {
    const listInfoById = Object.fromEntries(config.mdblistLists.map(l => [String(l.id), l.name]));
    config.catalogs = config.catalogs.map(c => {
      if (c.id.startsWith("mdblist.")) {
        const [, type, listId] = c.id.split(".");
        return {
          ...c,
          id: listId,
          type,
          name: `MDBList - ${listInfoById[listId] || listId}`
        };
      }
      return c;
    });
  }

  const translatedCatalogs = loadTranslations(language);
  const years = generateArrayOfYears(20);
  const genres_movie = (await getGenreList(language, "movie")).map(el => el.name).sort();
  const genres_series = (await getGenreList(language, "series")).map(el => el.name).sort();
  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);

  const options = { years, genres_movie, genres_series, filterLanguages };

  if (config.mdblistkey) {
    try {
      const mdblistLists = await getMDBLists(config.mdblistkey);
      for (const list of mdblistLists) {
        const { hasMovies, hasShows } = await getMDBListItems(list.id, config.mdblistkey);

        // Voeg lijsten toe als movie en/of series catalogus indien nog niet toegevoegd
        if (hasMovies && !config.catalogs.find(c => c.id === String(list.id) && c.type === "movie")) {
          config.catalogs.push({
            id: String(list.id),
            type: "movie",
            name: `MDBList - ${list.name} (Movies)`,
            showInHome: false,
            enabled: false
          });
        }
        if (hasShows && !config.catalogs.find(c => c.id === String(list.id) && c.type === "series")) {
          config.catalogs.push({
            id: String(list.id),
            type: "series",
            name: `MDBList - ${list.name} (Series)`,
            showInHome: false,
            enabled: false
          });
        }
      }
    } catch (err) {
      console.error("❌ Failed to fetch MDBList catalogs:", err);
    }
  }

  const catalogs = config.catalogs
    .filter(c => c.enabled !== false)
    .map(c => {
      // Controleer of c.id een MDBList-lijst-ID is
      if (config.mdblistLists && config.mdblistLists.find(l => String(l.id) === c.id)) {
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          pageSize: 20,
          extra: [{ name: "skip" }],
          showInHome: c.showInHome
        };
      }

      // TMDB catalogus
      const def = getCatalogDefinition(c.id);
      if (!def) return null;
      const opts = getOptionsForCatalog(def, c.type, c.showInHome, options);
      return createCatalog(c.id, c.type, def, opts, tmdbPrefix, translatedCatalogs, c.showInHome);
    })
    .filter(Boolean);

  if (config.searchEnabled !== "false") {
    ["movie", "series"].forEach(type => {
      catalogs.push({
        id: "tmdb.search",
        type,
        name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`,
        pageSize: 20,
        extra: [{ name: "search", isRequired: true }]
      });
    });
  }

  const activeConfigs = [
    `Language: ${language}`,
    `TMDB Account: ${sessionId ? "Connected" : "Not Connected"}`,
    `IMDb Integration: ${provideImdbId ? "Enabled" : "Disabled"}`,
    `RPDB Integration: ${config.rpdbkey ? "Enabled" : "Disabled"}`,
    `Search: ${config.searchEnabled !== "false" ? "Enabled" : "Disabled"}`,
    `Active Catalogs: ${catalogs.length}`
  ].join(" | ");

  return {
    id: packageJson.name,
    version: packageJson.version,
    favicon: `${process.env.HOST_NAME}/favicon.png`,
    logo: `${process.env.HOST_NAME}/logo.png`,
    background: `${process.env.HOST_NAME}/background.png`,
    name: "The Movie Database",
    description: `Stremio addon that provides rich metadata for movies and TV shows from TMDB… Current settings: ${activeConfigs}`,
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: provideImdbId ? ["tmdb:", "tt"] : ["tmdb:"],
    stremioAddonsConfig: {
      issuer: "https://stremio-addons.net",
      signature: ""
    },
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    },
    catalogs
  };
}

function getDefaultCatalogs() {
  const defaultTypes = ["movie", "series"];
  const defaultCatalogs = Object.keys(CATALOG_TYPES.default);
  return defaultCatalogs.flatMap(id =>
    defaultTypes.map(type => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true,
      enabled: true
    }))
  );
}

module.exports = { getManifest, DEFAULT_LANGUAGE };

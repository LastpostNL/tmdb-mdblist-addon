require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");
const DEFAULT_LANGUAGE = "nl-NL";  // <-- hier haakje weggehaald

// Fallback voor HOST_NAME
const HOST_NAME = process.env.HOST_NAME || "https://tmdb-mdblist-addon.onrender.com";

if (!process.env.TMDB_API_KEY) {
  console.error("❌ Geen geldige TMDB_API_KEY in environment aanwezig.");
  process.exit(1);
}

function generateArrayOfYears(maxYears) {
  const max = new Date().getFullYear();
  const min = max - maxYears;
  const years = [];
  for (let i = max; i >= min; i--) {
    years.push(i.toString());
  }
  return years;
}

function setOrderLanguage(language, languagesArray) {
  const languageObj = languagesArray.find((lang) => lang.iso_639_1 === language);
  if (!languageObj) return languagesArray.map(l => l.name).sort();
  const fromIndex = languagesArray.indexOf(languageObj);
  const element = languagesArray.splice(fromIndex, 1)[0];
  languagesArray = languagesArray.sort((a, b) => (a.name > b.name ? 1 : -1));
  languagesArray.splice(0, 0, element);
  return [...new Set(languagesArray.map((el) => el.name))];
}

function loadTranslations(language) {
  const defaultTranslations = catalogsTranslations[DEFAULT_LANGUAGE] || {};
  const selectedTranslations = catalogsTranslations[language] || {};
  return { ...defaultTranslations, ...selectedTranslations };
}

function getOptionsForCatalog(catalogDef, type, showInHome, { years, genres_movie, genres_series, filterLanguages }) {
  if (catalogDef.defaultOptions) return catalogDef.defaultOptions;

  const movieGenres = showInHome ? [...genres_movie] : ["Top", ...genres_movie];
  const seriesGenres = showInHome ? [...genres_series] : ["Top", ...genres_series];

  switch (catalogDef.nameKey) {
    case 'year':
      return years;
    case 'language':
      return filterLanguages;
    case 'popular':
      return type === 'movie' ? movieGenres : seriesGenres;
    default:
      return type === 'movie' ? movieGenres : seriesGenres;
  }
}

function createCatalog(id, type, catalogDef, options, tmdbPrefix, translatedCatalogs, showInHome = false) {
  const extra = [];
  if (catalogDef.extraSupported.includes("genre")) {
    extra.push({
      name: "genre",
      options: Array.isArray(options) ? options : options,
      isRequired: !showInHome
    });
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
  const [provider, type] = catalogId.split('.');
  for (const category of Object.keys(CATALOG_TYPES)) {
    if (CATALOG_TYPES[category][type]) return CATALOG_TYPES[category][type];
  }
  return null;
}

async function getManifest(config) {
  console.log("----- START getManifest -----");
  console.log("config:", JSON.stringify(config, null, 2));

  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;
  const userCatalogs = config.catalogs || [];

  const translatedCatalogs = loadTranslations(language);
  const years = generateArrayOfYears(20);

  // Haal TMDB genres op
  let genres_movie = [], genres_series = [];
  try { genres_movie = (await getGenreList(language, "movie")).map(g => g.name).sort(); }
  catch (e) { console.warn("⚠️ Fout bij ophalen movie genres:", e.message); }
  try { genres_series = (await getGenreList(language, "series")).map(g => g.name).sort(); }
  catch (e) { console.warn("⚠️ Fout bij ophalen series genres:", e.message); }

  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);
  const options = { years, genres_movie, genres_series, filterLanguages };

  // TMDB-catalogi
  const tmdbCatalogs = userCatalogs
    .filter(cat => !cat.id.startsWith("mdblist_"))
    .filter(cat => {
      const def = getCatalogDefinition(cat.id);
      return def && (!def.requiresAuth || sessionId);
    })
    .map(cat => {
      const def = getCatalogDefinition(cat.id);
      const opts = getOptionsForCatalog(def, cat.type, cat.showInHome, options);
      return createCatalog(cat.id, cat.type, def, opts, tmdbPrefix, translatedCatalogs, cat.showInHome);
    });

  // MDBList-catalogi: alleen enabled
  const mdblistCatalogs = userCatalogs
    .filter(cat => cat.id.startsWith("mdblist_") && cat.enabled)
    .map(cat => ({
      id: cat.id,
      type: cat.type,
      name: cat.name,
      extra: [{ name: "search", isRequired: false }],
    }));

  // Search-catalogi
  const searchCatalogs = [];
  if (config.searchEnabled !== "false") {
    searchCatalogs.push(
      { id: "tmdb.search", type: "movie", name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`, extra: [{ name:"search", isRequired:true, options:[] }] },
      { id: "tmdb.search", type: "series", name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`, extra: [{ name:"search", isRequired:true, options:[] }] },
    );
  }

  const catalogs = [...tmdbCatalogs, ...mdblistCatalogs, ...searchCatalogs];

  console.log("Final catalog IDs:", catalogs.map(c => c.id));
  console.log("HOST_NAME:", HOST_NAME);
  console.log("----- END getManifest -----");

  return {
    id: packageJson.name,
    version: packageJson.version,
    favicon: `${HOST_NAME}/favicon.png`,
    logo: `${HOST_NAME}/logo.png`,
    background: `${HOST_NAME}/background.png`,
    name: "The Movie Database",
    description: "Fork of the TMDB addon. Current settings: " + [
      `Language: ${language}`,
      `TMDB Account: ${sessionId ? 'Connected' : 'Not Connected'}`,
      `Search: ${config.searchEnabled !== "false" ? 'Enabled' : 'Disabled'}`,
      `Active Catalogs: ${catalogs.length}`
    ].join(' | '),
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: provideImdbId ? ["tmdb:", "tt"] : ["tmdb:"],
    behaviorHints: { configurable: true, configurationRequired: false },
    catalogs,
  };
}

module.exports = { getManifest };

// getManifest.js
require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");
const DEFAULT_LANGUAGE = "en-US";

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

function createCatalog(id, type, catalogDef, options, tmdbPrefix, translatedCatalogs, showInHome = false) {
  const extra = [];

  if (catalogDef.extraSupported.includes("genre")) {
    if (catalogDef.defaultOptions) {
      const formattedOptions = catalogDef.defaultOptions.map(option => {
        if (option.includes('.')) {
          const [field, order] = option.split('.');
          if (translatedCatalogs[field] && translatedCatalogs[order]) {
            return `${translatedCatalogs[field]} (${translatedCatalogs[order]})`;
          }
          return option;
        }
        return translatedCatalogs[option] || option;
      });
      extra.push({ name: "genre", options: formattedOptions, isRequired: !showInHome });
    } else {
      extra.push({ name: "genre", options, isRequired: !showInHome });
    }
  }
  if (catalogDef.extraSupported.includes("search")) {
    extra.push({ name: "search" });
  }
  if (catalogDef.extraSupported.includes("skip")) {
    extra.push({ name: "skip" });
  }

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
    if (CATALOG_TYPES[category][type]) {
      return CATALOG_TYPES[category][type];
    }
  }
  return null;
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

async function getManifest(config) {
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;
  const userCatalogs = config.catalogs || getDefaultCatalogs();
  const translatedCatalogs = loadTranslations(language);

  // TMDB essentials
  const years = generateArrayOfYears(20);
  const genres_movie = (await getGenreList(language, "movie")).map(el => el.name).sort();
  const genres_series = (await getGenreList(language, "series")).map(el => el.name).sort();
  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);
  const options = { years, genres_movie, genres_series, filterLanguages };

  // Bouw de TMDB-catalogi
  let catalogs = userCatalogs
    .filter(uc => {
      const def = getCatalogDefinition(uc.id);
      if (!def) return false;
      if (def.requiresAuth && !sessionId) return false;
      return !uc.id.startsWith("mdblist."); // MDblist slaan we hier nog even over
    })
    .map(uc => {
      const def = getCatalogDefinition(uc.id);
      const opts = getOptionsForCatalog(def, uc.type, uc.showInHome, options);
      return createCatalog(
        uc.id, uc.type, def, opts, tmdbPrefix, translatedCatalogs, uc.showInHome
      );
    });

  // Voeg TMDB search-catalogi toe als geactiveerd
  if (config.searchEnabled !== "false") {
    ['movie','series'].forEach(type => {
      catalogs.push({
        id: "tmdb.search",
        type,
        name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`,
        pageSize: 20,
        extra: [{ name: "search", isRequired: true }]
      });
    });
  }

// ─── HIER MDBList toevoegen ───────────────────────────────────────────────────
const { getMDBLists } = require("./getMDBList");

if (config.mdblistUserToken) {
  try {
    const mdblistCatalogs = await getMDBLists(config.mdblistUserToken);
    mdblistCatalogs.forEach(list => {
      const id = `mdblist_${list.slug}`;
      const name = list.name || list.slug;
      const type = list.type === 'show' ? 'series' : 'movie';

      catalogs.push({
        id,
        type,
        name: `MDBList - ${name}`,
        pageSize: 20,
        extra: [{ name: "skip" }]
      });
    });
  } catch (err) {
    console.error("MDBList catalog fetch failed:", err.message);
  }
}
// ──────────────────────────────────────────────────────────────────────────────


  // Metadata beschrijving
  const activeConfigs = [
    `Language: ${language}`,
    `TMDB Account: ${sessionId ? 'Connected' : 'Not Connected'}`,
    `IMDb Integration: ${provideImdbId ? 'Enabled' : 'Disabled'}`,
    `RPDB Integration: ${config.rpdbkey ? 'Enabled' : 'Disabled'}`,
    `Search: ${config.searchEnabled !== "false" ? 'Enabled' : 'Disabled'}`,
    `Active Catalogs: ${catalogs.length}`
  ].join(' | ');

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
      signature: "" // kun je verwijderen of laten leeg
    },
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
    catalogs
  };
}

function getDefaultCatalogs() {
  const defaultTypes = ['movie', 'series'];
  const defaultCatalogs = Object.keys(CATALOG_TYPES.default);
  return defaultCatalogs.flatMap(id =>
    defaultTypes.map(type => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true
    }))
  );
}

module.exports = { getManifest, DEFAULT_LANGUAGE };

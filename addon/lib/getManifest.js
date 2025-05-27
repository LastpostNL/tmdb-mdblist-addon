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
  if (!languageObj) return languagesArray.map((el) => el.name);
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

// MDBList helper om items op te halen en te checken op media types
async function getMDBListItems(listId, apiKey) {
  const url = `https://api.mdblist.com/lists/${listId}/items?apikey=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch list items for ${listId}: ${res.statusText}`);
    }
    const data = await res.json();

    const hasMovies = Array.isArray(data.movies) && data.movies.length > 0;
    const hasShows = Array.isArray(data.shows) && data.shows.length > 0;

    return { hasMovies, hasShows };
  } catch (err) {
    console.error(err);
    return { hasMovies: false, hasShows: false };
  }
}

async function getManifest(config) {
  console.log("🛠️ getManifest() CALLED");
  console.log("  config:", JSON.stringify(config));
  console.log("  userCatalogs:", JSON.stringify(config.catalogs));

  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;
  config.catalogs = config.catalogs || getDefaultCatalogs();
  const translatedCatalogs = loadTranslations(language);

  // TMDB essentials
  const years = generateArrayOfYears(20);
  const genres_movie = (await getGenreList(language, "movie")).map(el => el.name).sort();
  const genres_series = (await getGenreList(language, "series")).map(el => el.name).sort();
  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);
  const options = { years, genres_movie, genres_series, filterLanguages };

  // Voeg MDBList catalogi toe aan config.catalogs als ze nog niet bestaan
  if (config.mdblistkey) {
    console.log("🔑 MDBList key found:", config.mdblistkey);
    const { getMDBLists } = require("./getMDBList");
    try {
      const mdblistLists = await getMDBLists(config.mdblistkey);
      console.log(`📦 Retrieved ${mdblistLists.length} MDBList lists:`,
                  mdblistLists.map(l => `${l.id} (“${l.name}”)`).join(", "));

      for (const list of mdblistLists) {
        const { hasMovies, hasShows } = await getMDBListItems(list.id, config.mdblistkey);
        console.log(`   → List ${list.id} (“${list.name}”) hasMovies=${hasMovies}, hasShows=${hasShows}`);

        // Voeg movie-catalog toe
        if (hasMovies && !config.catalogs.find(c => c.id === `mdblist_${list.id}_movie`)) {
          config.catalogs.push({
            id: `mdblist_${list.id}_movie`,
            type: "movie",
            name: `MDBList - ${list.name} (Movies)`,
            showInHome: false,
            enabled: false,
          });
          console.log(`     • Added catalog mdblist_${list.id}_movie`);
        }
        // Voeg series-catalog toe
        if (hasShows && !config.catalogs.find(c => c.id === `mdblist_${list.id}_series`)) {
          config.catalogs.push({
            id: `mdblist_${list.id}_series`,
            type: "series",
            name: `MDBList - ${list.name} (Series)`,
            showInHome: false,
            enabled: false,
          });
          console.log(`     • Added catalog mdblist_${list.id}_series`);
        }
      }
    } catch (err) {
      console.error("❌ Failed to fetch MDBList catalogs:", err);
    }
  }

  // Bouw catalogs array enkel met ingeschakelde catalogi
const catalogs = config.catalogs
    .filter(c => c.enabled)
    .map(c => {
      // MDBList catalogi
      if (c.id.startsWith("mdblist_")) {
        console.log("🏷️ Building MDBList catalog entry for:", c.id);
        const [, listId, mediaType] = c.id.split("_");
        return {
          id: c.id,
          type: mediaType,
          name: c.name,
          pageSize: 20,
          extra: [{ name: "skip" }],
          showInHome: c.showInHome,
        };
      }

      // TMDB catalogi
      const def = getCatalogDefinition(c.id);
      if (!def) return null;
      const opts = getOptionsForCatalog(def, c.type, c.showInHome, options);
      return createCatalog(c.id, c.type, def, opts, tmdbPrefix, translatedCatalogs, c.showInHome);
    })
    .filter(Boolean);

  console.log(`✅ Final catalogs array (${catalogs.length}):`,
              catalogs.map(cat => cat.id).join(", "));

  // TMDB search-catalogi toevoegen als ingeschakeld
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
      signature: "" // kan leeg blijven
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
      showInHome: true,
      enabled: true,
    }))
  );
}

module.exports = { getManifest, DEFAULT_LANGUAGE };

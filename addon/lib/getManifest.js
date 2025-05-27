require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { getMDBLists } = require("./getMDBList");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "en-US";

function generateArrayOfYears(maxYears) {
  const currentYear = new Date().getFullYear();
  console.log(`[generateArrayOfYears] Generating years array for last ${maxYears} years, current year: ${currentYear}`);
  return Array.from({ length: maxYears + 1 }, (_, i) => (currentYear - i).toString());
}

function setOrderLanguage(language, languagesArray) {
  console.log(`[setOrderLanguage] Setting order for language: ${language}`);
  const languageObj = languagesArray.find(l => l.iso_639_1 === language);
  if (!languageObj) {
    console.log(`[setOrderLanguage] Language '${language}' not found in languagesArray, returning all names unsorted.`);
    return languagesArray.map(el => el.name);
  }
  // Verwijder gevonden element uit de array
  const fromIndex = languagesArray.indexOf(languageObj);
  if (fromIndex > -1) languagesArray.splice(fromIndex, 1);
  // Sorteer alfabetisch
  languagesArray.sort((a, b) => a.name.localeCompare(b.name));
  // Voeg het gevonden element als eerste toe
  languagesArray.unshift(languageObj);
  const result = [...new Set(languagesArray.map(el => el.name))];
  console.log(`[setOrderLanguage] Ordered languages array:`, result);
  return result;
}

function loadTranslations(language) {
  console.log(`[loadTranslations] Loading translations for language: ${language}`);
  const translations = {
    ...catalogsTranslations[DEFAULT_LANGUAGE],
    ...(catalogsTranslations[language] || {})
  };
  console.log(`[loadTranslations] Loaded translations keys:`, Object.keys(translations));
  return translations;
}

function createCatalog(id, type, catalogDef, options, tmdbPrefix, translatedCatalogs, showInHome = false) {
  console.log(`[createCatalog] Creating catalog: id=${id}, type=${type}, nameKey=${catalogDef.nameKey}, showInHome=${showInHome}`);
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
      extra.push({ name: "genre", options: formattedOptions, isRequired: showInHome ? false : true });
    } else {
      extra.push({ name: "genre", options, isRequired: showInHome ? false : true });
    }
  }
  if (catalogDef.extraSupported.includes("search")) {
    extra.push({ name: "search" });
  }
  if (catalogDef.extraSupported.includes("skip")) {
    extra.push({ name: "skip" });
  }

  const catalog = {
    id,
    type,
    name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs[catalogDef.nameKey]}`,
    pageSize: 20,
    extra
  };
  console.log(`[createCatalog] Created catalog:`, catalog);
  return catalog;
}

function getCatalogDefinition(catalogId) {
  console.log(`[getCatalogDefinition] Getting catalog definition for id: ${catalogId}`);
  const [, type] = catalogId.split(".");
  const def = Object.values(CATALOG_TYPES)
    .flatMap(t => Object.values(t))
    .find(def => def.nameKey === type) || null;
  console.log(`[getCatalogDefinition] Found definition:`, def);
  return def;
}

function getOptionsForCatalog(catalogDef, type, showInHome, { years, genres_movie, genres_series, filterLanguages }) {
  console.log(`[getOptionsForCatalog] Getting options for catalog: ${catalogDef.nameKey}, type: ${type}, showInHome: ${showInHome}`);
  if (catalogDef.defaultOptions) {
    console.log(`[getOptionsForCatalog] Using defaultOptions from catalogDef`);
    return catalogDef.defaultOptions;
  }

  const movieGenres = showInHome ? [...genres_movie] : ["Top", ...genres_movie];
  const seriesGenres = showInHome ? [...genres_series] : ["Top", ...genres_series];

  switch (catalogDef.nameKey) {
    case 'year':
      console.log(`[getOptionsForCatalog] Returning years options`);
      return years;
    case 'language':
      console.log(`[getOptionsForCatalog] Returning language options`);
      return filterLanguages;
    case 'popular':
      console.log(`[getOptionsForCatalog] Returning popular genre options`);
      return type === 'movie' ? movieGenres : seriesGenres;
    default:
      console.log(`[getOptionsForCatalog] Returning default genre options`);
      return type === 'movie' ? movieGenres : seriesGenres;
  }
}

async function getMDBListItems(listId, apiKey) {
  console.log(`[getMDBListItems] Fetching list items for listId=${listId} with apiKey=${apiKey ? '***' : 'MISSING'}`);
  try {
    const res = await fetch(`https://api.mdblist.com/lists/${listId}/items?apikey=${apiKey}`);
    if (!res.ok) {
      console.error(`[getMDBListItems] Failed to fetch list items for ${listId}: HTTP ${res.status} - ${res.statusText}`);
      throw new Error(`Failed to fetch list items for ${listId}: ${res.statusText}`);
    }
    const data = await res.json();
    console.log(`[getMDBListItems] Retrieved data for list ${listId}: movies=${data.movies?.length || 0}, shows=${data.shows?.length || 0}`);
    return {
      hasMovies: Array.isArray(data.movies) && data.movies.length > 0,
      hasShows: Array.isArray(data.shows) && data.shows.length > 0
    };
  } catch (err) {
    console.error(`[getMDBListItems] Error fetching list items for ${listId}:`, err);
    return { hasMovies: false, hasShows: false };
  }
}

async function getManifest(config) {
  console.log(`[getManifest] Starting manifest generation with config:`, config);

  config.catalogs = (config.catalogs || getDefaultCatalogs()).map(c => ({ ...c, enabled: c.enabled !== false }));
  console.log(`[getManifest] Normalized catalogs:`, config.catalogs);

  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;

  // Normaliseer MDBList catalogs: vervang oude "mdblist." prefix door puur lijst-ID als string
  if (Array.isArray(config.catalogs) && Array.isArray(config.mdblistLists)) {
    const listInfoById = Object.fromEntries(config.mdblistLists.map(l => [String(l.id), l.name]));
    console.log(`[getManifest] Normalizing MDBList catalogs with list info:`, listInfoById);
    config.catalogs = config.catalogs.map(c => {
      if (c.id.startsWith("mdblist.")) {
        const [, type, listId] = c.id.split(".");
        console.log(`[getManifest] Normalizing catalog id ${c.id} to listId=${listId} and type=${type}`);
        return {
          ...c,
          id: listId,
          type,
          name: `MDBList - ${listInfoById[listId] || listId}`
        };
      }
      return c;
    });
    console.log(`[getManifest] MDBList catalogs normalized:`, config.catalogs.filter(c => c.id && !c.id.startsWith('tmdb.')));
  }

  const translatedCatalogs = loadTranslations(language);
  const years = generateArrayOfYears(20);
  const genres_movie = (await getGenreList(language, "movie")).map(el => el.name).sort();
  const genres_series = (await getGenreList(language, "series")).map(el => el.name).sort();
  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);

  const options = { years, genres_movie, genres_series, filterLanguages };
  console.log(`[getManifest] Options prepared for catalogs.`);

  if (config.mdblistkey) {
    console.log(`[getManifest] Fetching MDBList lists using mdblistkey.`);
    try {
      const mdblistLists = await getMDBLists(config.mdblistkey);
      console.log(`[getManifest] Fetched MDBList lists:`, mdblistLists);
      for (const list of mdblistLists) {
        console.log(`[getManifest] Processing MDBList ${list.name} (${list.id})`);
        const { hasMovies, hasShows } = await getMDBListItems(list.id, config.mdblistkey);
        console.log(`[getManifest] List hasMovies=${hasMovies}, hasShows=${hasShows}`);

        // Voeg lijsten toe als movie en/of series catalogus indien nog niet toegevoegd
if (hasMovies && !config.catalogs.find(c => c.id === String(list.id) && c.type === "movie")) {
  const catalogMovie = {
    id: String(list.id),
    type: "movie",
    name: `MDBList - ${list.name} (Movies)`,
    showInHome: false,
    enabled: false
  };
  config.catalogs.push(catalogMovie);
  console.log(`[getManifest] Added MDBList movie catalog: id=${catalogMovie.id}, type=${catalogMovie.type}, showInHome=${catalogMovie.showInHome}`);
}
if (hasShows && !config.catalogs.find(c => c.id === String(list.id) && c.type === "series")) {
  const catalogSeries = {
    id: String(list.id),
    type: "series",
    name: `MDBList - ${list.name} (Series)`,
    showInHome: false,
    enabled: false
  };
  config.catalogs.push(catalogSeries);
  console.log(`[getManifest] Added MDBList series catalog: id=${catalogSeries.id}, type=${catalogSeries.type}, showInHome=${catalogSeries.showInHome}`);
}
    } catch (err) {
      console.error("❌ Failed to fetch MDBList catalogs:", err);
    }
  } else {
    console.log(`[getManifest] No mdblistkey provided, skipping MDBList catalog addition.`);
  }

  const catalogs = config.catalogs
    .filter(c => c.enabled !== false)
    .map(c => {
      // Controleer of c.id een MDBList-lijst-ID is
      if (config.mdblistLists && config.mdblistLists.find(l => String(l.id) === c.id)) {
        console.log(`[getManifest] Creating MDBList catalog for id=${c.id}, type=${c.type}`);
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
      if (!def) {
        console.warn(`[getManifest] No catalog definition found for id=${c.id}, skipping.`);
        return null;
      }
      const opts = getOptionsForCatalog(def, c.type, c.showInHome, options);
      return createCatalog(c.id, c.type, def, opts, tmdbPrefix, translatedCatalogs, c.showInHome);
    })
    .filter(Boolean);

  if (config.searchEnabled !== "false") {
    ["movie", "series"].forEach(type => {
      console.log(`[getManifest] Adding search catalog for type=${type}`);
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

  console.log(`[getManifest] Finished manifest generation. Active configs: ${activeConfigs}`);

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
  console.log(`[getDefaultCatalogs] Generating default catalogs`);
  const defaultTypes = ["movie", "series"];
  const defaultCatalogs = Object.keys(CATALOG_TYPES.default);
  const result = defaultCatalogs.flatMap(id =>
    defaultTypes.map(type => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true,
      enabled: true
    }))
  );
  console.log(`[getDefaultCatalogs] Default catalogs generated:`, result);
  return result;
}

module.exports = { getManifest, DEFAULT_LANGUAGE };

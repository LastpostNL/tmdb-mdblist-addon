require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");
const DEFAULT_LANGUAGE = "en-US";

if (!process.env.TMDB_API_KEY) {
  console.error("❌ Geen geldige TMDB_API_KEY in .env aanwezig.");
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
  console.log("----- START getManifest -----");
  console.log("config:", JSON.stringify(config, null, 2));

  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";
  const sessionId = config.sessionId;
  const userCatalogs = config.catalogs || getDefaultCatalogs();
console.log("userCatalogs:", JSON.stringify(userCatalogs, null, 2));

  const translatedCatalogs = loadTranslations(language);

  console.log("User catalogs (config.catalogs):", JSON.stringify(userCatalogs, null, 2));

  const years = generateArrayOfYears(20);

  let genres_movie = [];
  try {
    const rawGenres = await getGenreList(language, "movie");
    if (Array.isArray(rawGenres)) {
      genres_movie = rawGenres.map(el => el.name).sort();
    } else {
      console.warn("⚠️ Geen geldige movie genres ontvangen van TMDB.");
    }
  } catch (err) {
    console.warn("⚠️ Fout bij ophalen movie genres:", err.message);
  }

  let genres_series = [];
  try {
    const rawGenres = await getGenreList(language, "series");
    if (Array.isArray(rawGenres)) {
      genres_series = rawGenres.map(el => el.name).sort();
    } else {
      console.warn("⚠️ Geen geldige series genres ontvangen van TMDB.");
    }
  } catch (err) {
    console.warn("⚠️ Fout bij ophalen series genres:", err.message);
  }

  const languagesArray = await getLanguages();
  const filterLanguages = setOrderLanguage(language, languagesArray);
  const options = { years, genres_movie, genres_series, filterLanguages };

  // Log MDBList config data
  console.log("MDBList config:", JSON.stringify(config.mdblist, null, 2));

console.log("userCatalogs BEFORE filtering:", userCatalogs.map(c => c.id));

  const filteredUserCatalogs = userCatalogs.filter(cat => {
    if (cat.id.startsWith("mdblist_")) {
      const listId = cat.id.replace("mdblist_", "");
      const isSelected = config.mdblist &&
        Array.isArray(config.mdblist.selectedLists) &&
        config.mdblist.selectedLists.includes(listId);

      console.log(`Filtering mdblist catalog '${cat.id}' => selected: ${isSelected}`);
      return isSelected;
    }
    return true;
  });
console.log("filteredUserCatalogs AFTER filtering:", filteredUserCatalogs.map(c => c.id));

  console.log("Filtered user catalogs:", JSON.stringify(filteredUserCatalogs, null, 2));

  let catalogs = filteredUserCatalogs
    .filter(userCatalog => {
      const catalogDef = getCatalogDefinition(userCatalog.id);
      if (!catalogDef) return false;
      if (catalogDef.requiresAuth && !sessionId) return false;
      return true;
    })
    .map(userCatalog => {
      const catalogDef = getCatalogDefinition(userCatalog.id);
      const catalogOptions = getOptionsForCatalog(catalogDef, userCatalog.type, userCatalog.showInHome, options);
      return createCatalog(
        userCatalog.id,
        userCatalog.type,
        catalogDef,
        catalogOptions,
        tmdbPrefix,
        translatedCatalogs,
        userCatalog.showInHome
      );
    });

  // Voeg MDBList catalogi toe die geselecteerd zijn maar (misschien) niet in userCatalogs zaten
  if (config.mdblist && Array.isArray(config.mdblist.lists) && Array.isArray(config.mdblist.selectedLists)) {
    const selectedLists = config.mdblist.lists.filter(list => config.mdblist.selectedLists.includes(list.id));
    const existingCatalogIds = new Set(catalogs.map(c => c.id));

    console.log("Selected MDBList lists:", JSON.stringify(selectedLists, null, 2));
    console.log("Existing catalog IDs before adding selected MDBList:", Array.from(existingCatalogIds));

    selectedLists.forEach(list => {
      const type = list.mediatype === "show" ? "series" : list.mediatype || "movie";
      const catalogId = `mdblist_${list.id}`;
      if (!existingCatalogIds.has(catalogId)) {
        console.log(`Adding MDBList catalog: ${catalogId} (${list.name})`);
        catalogs.push({
          id: catalogId,
          type,
          name: `[MDBList] ${list.name}`,
          extra: [{ name: "search", isRequired: false }]
        });
      }
    });

    console.log("Catalog IDs after adding selected MDBList:", catalogs.map(c => c.id));
  }

  if (config.searchEnabled !== "false") {
    const searchCatalogMovie = {
      id: "tmdb.search",
      type: "movie",
      name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`,
      extra: [{ name: "search", isRequired: true, options: [] }]
    };

    const searchCatalogSeries = {
      id: "tmdb.search",
      type: "series",
      name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs.search}`,
      extra: [{ name: "search", isRequired: true, options: [] }]
    };

    catalogs = [...catalogs, searchCatalogMovie, searchCatalogSeries];
  }

  const activeConfigs = [
    `Language: ${language}`,
    `TMDB Account: ${sessionId ? 'Connected' : 'Not Connected'}`,
    `IMDb Integration: ${provideImdbId ? 'Enabled' : 'Disabled'}`,
    `RPDB Integration: ${config.rpdbkey ? 'Enabled' : 'Disabled'}`,
    `Search: ${config.searchEnabled !== "false" ? 'Enabled' : 'Disabled'}`,
    `Active Catalogs: ${catalogs.length}`
  ].join(' | ');

  console.log("Final catalogs array:", catalogs.map(c => c.id));

  console.log("----- END getManifest -----");

  return {
    id: packageJson.name,
    version: packageJson.version,
    favicon: `${process.env.HOST_NAME}/favicon.png`,
    logo: `${process.env.HOST_NAME}/logo.png`,
    background: `${process.env.HOST_NAME}/background.png`,
    name: "The Movie Database",
    description: "Fork of the TMDB addon for use with Omni (https://omni.stkc.win). Current settings: " + activeConfigs,
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: provideImdbId ? ["tmdb:", "tt"] : ["tmdb:"],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
    catalogs,
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
      enabled: true
    }))
  );
}

module.exports = { getManifest, DEFAULT_LANGUAGE };

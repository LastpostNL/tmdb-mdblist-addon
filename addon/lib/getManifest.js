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
  return Array.from({ length: maxYears + 1 }, (_, i) => (currentYear - i).toString());
}

function setOrderLanguage(language, languagesArray) {
  const languageObjIndex = languagesArray.findIndex(l => l.iso_639_1 === language);
  if (languageObjIndex === -1) {
    return languagesArray.map(el => el.name);
  }
  const languageObj = languagesArray.splice(languageObjIndex, 1)[0];
  languagesArray.sort((a, b) => a.name.localeCompare(b.name));
  languagesArray.unshift(languageObj);
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
    extra,
    showInHome
  };
}

function getCatalogDefinition(catalogId) {
  const parts = catalogId.split(".");
  const type = parts.length > 1 ? parts[1] : null;
  const def = Object.values(CATALOG_TYPES)
    .flatMap(t => Object.values(t))
    .find(def => def.nameKey === type);
  return def || null;
}

function getOptionsForCatalog(catalogDef, type, showInHome, { years, genres_movie, genres_series, filterLanguages }) {
  if (catalogDef.defaultOptions) {
    return catalogDef.defaultOptions;
  }

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
  // Zorg dat config.catalogs altijd een array is, default fallback
  config.catalogs = (config.catalogs || getDefaultCatalogs()).map(c => ({ ...c, enabled: c.enabled !== false }));

  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";
  const provideImdbId = config.provideImdbId === "true";

  // Zet mdblist catalog IDs terug naar alleen numeriek id, met type en naam erbij
  if (Array.isArray(config.catalogs) && Array.isArray(config.mdblistLists)) {
    const listInfoById = Object.fromEntries(config.mdblistLists.map(l => [String(l.id), l.name]));
    config.catalogs = config.catalogs.map(c => {
      if (c.id.startsWith("mdblist.")) {
        const parts = c.id.split(".");
        if (parts.length === 3) {
          const [, type, listId] = parts;
          return {
            ...c,
            id: String(listId),
            type,
            name: `MDBList - ${listInfoById[listId] || listId}`
          };
        }
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

  // Voeg MDBList catalogi toe, gebaseerd op mdblistLists + mediatype uit list object
  if (config.mdblistkey && Array.isArray(config.mdblistLists)) {
    for (const list of config.mdblistLists) {
      // Gebruik mediatype van lijst zelf, geen aparte call voor items
      if (list.mediatype === "movie" || list.mediatype === "both") {
        if (!config.catalogs.find(c => c.id === String(list.id) && c.type === "movie")) {
          config.catalogs.push({
            id: String(list.id),
            type: "movie",
            name: `MDBList - ${list.name} (Movies)`,
            showInHome: false,
            enabled: false
          });
          console.log(`[MDBList] Added catalog: mdblist.movie.${list.id} (${list.name})`);
        }
      }
      if (list.mediatype === "series" || list.mediatype === "both") {
        if (!config.catalogs.find(c => c.id === String(list.id) && c.type === "series")) {
          config.catalogs.push({
            id: String(list.id),
            type: "series",
            name: `MDBList - ${list.name} (Series)`,
            showInHome: false,
            enabled: false
          });
          console.log(`[MDBList] Added catalog: mdblist.series.${list.id} (${list.name})`);
        }
      }
    }
  }

  // Filter alleen ingeschakelde catalogi
  const catalogs = config.catalogs
    .filter(c => c.enabled !== false)
    .map(c => {
      // MDBList catalogen: simpele objecten met skip extra
      if (config.mdblistLists && config.mdblistLists.find(l => String(l.id) === c.id)) {
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          pageSize: 20,
          extra: [{ name: "skip" }],
          showInHome: typeof c.showInHome === 'boolean' ? c.showInHome : false
        };
      }

      // TMDB catalogi: volgens catalogType config
      const def = getCatalogDefinition(c.id);
      if (!def) return null;

      const opts = getOptionsForCatalog(def, c.type, c.showInHome, options);
      return createCatalog(c.id, c.type, def, opts, tmdbPrefix, translatedCatalogs, c.showInHome);
    })
    .filter(Boolean);

  // Voeg TMDB search catalogi toe als ingeschakeld
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

  return {
    id: packageJson.name,
    version: packageJson.version,
    name: translatedCatalogs.addon_name || "TMDb Addon",
    description: translatedCatalogs.addon_description || "A Stremio addon based on The Movie Database (TMDb)",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    catalogs,
    behaviorHints: {
      configurationRequired: false,
      configurable: true
    },
    idPrefixes: provideImdbId ? ["tt"] : [],
    background: `${process.env.HOST_NAME}/background.jpg`,
    logo: `${process.env.HOST_NAME}/logo.png`
  };
}

function getDefaultCatalogs() {
  return [
    { id: "tmdb.top", type: "movie", enabled: true, showInHome: true },
    { id: "tmdb.top", type: "series", enabled: true, showInHome: true }
  ];
}

module.exports = { getManifest };

require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const moviedb = new MovieDb(process.env.TMDB_API_KEY);

const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { parseMedia } = require("../utils/parseProps");
const CATALOG_TYPES = require("../static/catalog-types.json");

// Hoofd export
async function getCatalog(args) {
  const { id, extra, extraInputs, config, language = "en-US" } = args;

  // MDBList catalogus afhandeling
  if (id.startsWith("mdblist_")) {
    return getMDBListCatalog(id, extraInputs, config);
  }

  // TMDB afhandeling
  const typeRaw = id.split(".").pop(); // movie, series, etc.
  const type = typeRaw === "series" ? "tv" : typeRaw;

  let page = 1;
  if (extra && extra.length > 0) {
    const skipExtra = extra.find(e => e.name === "skip");
    if (skipExtra) page = skipExtra.value + 1;
  }

  const genre = extraInputs?.find(e => e.name === "genre")?.value;
  const searchQuery = extraInputs?.find(e => e.name === "search")?.value;

  const genreList = await getGenreList(language, typeRaw);

  if (id === "tmdb.search" && searchQuery) {
    // Search via TMDB
    try {
      const res = await moviedb.search(type, {
        query: searchQuery,
        language,
        page,
      });
      const metas = res.results.map(item => parseMedia(item, typeRaw, genreList));
      return { metas, cacheMaxAge: 3600 };
    } catch (err) {
      console.error("TMDB search error:", err);
      return { metas: [], cacheMaxAge: 300 };
    }
  }

  // Build parameters voor discover calls
  const parameters = await buildParameters(typeRaw, language, page, id, genre, genreList, config);

  const fetchFunction = type === "movie" ? moviedb.discoverMovie.bind(moviedb) : moviedb.discoverTv.bind(moviedb);

  try {
    const res = await fetchFunction(parameters);
    const metas = res.results.map(el => parseMedia(el, typeRaw, genreList));
    return { metas, cacheMaxAge: 3600 };
  } catch (err) {
    console.error("TMDB discover error:", err);
    return { metas: [], cacheMaxAge: 300 };
  }
}

// Hulpfuncties zoals in origineel

async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages();
  const parameters = { language, page, 'vote_count.gte': 10 };

  if (config.ageRating) {
    switch (config.ageRating) {
      case "G":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? "G" : "TV-G";
        break;
      case "PG":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? ["G", "PG"].join("|") : ["TV-G", "TV-PG"].join("|");
        break;
      case "PG-13":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? ["G", "PG", "PG-13"].join("|") : ["TV-G", "TV-PG", "TV-14"].join("|");
        break;
      case "R":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? ["G", "PG", "PG-13", "R"].join("|") : ["TV-G", "TV-PG", "TV-14", "TV-MA"].join("|");
        break;
      case "NC-17":
        // geen parameters meegegeven
        break;
    }
  }

  if (id.includes("streaming")) {
    const provider = findProvider(id.split(".")[1]);
    if (genre) parameters.with_genres = findGenreId(genre, genreList);
    parameters.with_watch_providers = provider.watchProviderId;
    parameters.watch_region = provider.country;
    parameters.with_watch_monetization_types = "flatrate|free|ads";
  } else {
    switch (id) {
      case "tmdb.top":
        if (genre) parameters.with_genres = findGenreId(genre, genreList);
        if (type === "series") {
          parameters.watch_region = language.split("-")[1];
          parameters.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
        }
        break;
      case "tmdb.year":
        const year = genre || new Date().getFullYear();
        if (type === "movie") {
          parameters.primary_release_year = year;
        } else {
          parameters.first_air_date_year = year;
        }
        break;
      case "tmdb.language":
        const langCode = genre ? findLanguageCode(genre, languages) : language.split("-")[0];
        parameters.with_original_language = langCode;
        break;
      default:
        break;
    }
  }
  return parameters;
}

function findGenreId(genreName, genreList) {
  const genreData = genreList.find(genre => genre.name === genreName);
  return genreData ? genreData.id : undefined;
}

function findLanguageCode(genre, languages) {
  const language = languages.find(lang => lang.name === genre);
  return language ? language.iso_639_1.split("-")[0] : "";
}

function findProvider(providerId) {
  const provider = CATALOG_TYPES.streaming[providerId];
  if (!provider) throw new Error(`Could not find provider: ${providerId}`);
  return provider;
}

// MDBList catalogus ophalen (zoals jij al had)

async function getMDBListCatalog(id, extraInputs, config) {
  const MDBLIST_BASE_URL = process.env.MDBLIST_BASE_URL || "https://api.mdblist.com";
  const listId = id.replace("mdblist_", "");
  const url = `${MDBLIST_BASE_URL}/lists/${listId}/items`;

  let page = 1;
  if (extraInputs && extraInputs.length > 0) {
    const skipExtra = extraInputs.find(e => e.name === "skip");
    if (skipExtra) page = skipExtra.value + 1;
  }

  try {
    const res = await fetch(`${url}?page=${page}`, {
      headers: {
        Authorization: `Bearer ${config.mdblistkey || ""}`,
      },
    });

    if (!res.ok) {
      throw new Error(`MDBList API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    if (!Array.isArray(json.items)) {
      return { metas: [], cacheMaxAge: 300 };
    }

    const metas = json.items.map(item => ({
      id: item.tmdbId ? `tmdb:${item.tmdbId}` : `mdblist:${item.id}`,
      type: item.mediaType === "show" ? "series" : "movie",
      name: item.title || item.name,
      poster: item.poster || null,
      backdrop: item.backdrop || null,
      releaseInfo: item.releaseDate || null,
      overview: item.overview || "",
      imdb_id: item.imdbId || null,
      genres: item.genres || [],
      runtime: item.runtime || null,
    }));

    return { metas, cacheMaxAge: 3600 };
  } catch (error) {
    console.error("Error fetching MDBList catalog:", error);
    return { metas: [], cacheMaxAge: 300 };
  }
}

module.exports = { getCatalog };

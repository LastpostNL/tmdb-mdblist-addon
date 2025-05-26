const fetch = require("node-fetch");
require("dotenv").config();

const API_KEY = process.env.TMDB_API_KEY;
const MDBLIST_BASE_URL = process.env.MDBLIST_BASE_URL || "https://api.mdblist.com";

async function getCatalog(args) {
  const { id, extra, extraInputs, config } = args;

  const isMDBList = id.startsWith("mdblist_");
  if (isMDBList) {
    // Handle MDBList catalog fetch
    return getMDBListCatalog(id, extraInputs, config);
  }

  if (!API_KEY) {
    throw new Error("TMDB_API_KEY missing in environment variables");
  }

  const type = id.split(".").pop(); // movie or series or other
  let page = 1;
  if (extra && extra.length > 0) {
    const pageExtra = extra.find(e => e.name === "skip");
    if (pageExtra) {
      page = pageExtra.value + 1;
    }
  }

  let url = "";
  let searchQuery = null;
  let genre = null;

  if (extraInputs && extraInputs.length > 0) {
    for (const input of extraInputs) {
      if (input.name === "search" && input.value) {
        searchQuery = input.value;
      }
      if (input.name === "genre" && input.value) {
        genre = input.value;
      }
    }
  }

  if (id === "tmdb.search" && searchQuery) {
    url = `https://api.themoviedb.org/3/search/${type}?api_key=${API_KEY}&language=en-US&query=${encodeURIComponent(searchQuery)}&page=${page}`;
  } else {
    // Handle popular, top_rated, upcoming etc.
    const path = id.replace(/^tmdb\./, "").replace(`.${type}`, "");
    url = `https://api.themoviedb.org/3/${type}/${path}?api_key=${API_KEY}&language=en-US&page=${page}`;
  }

  // Append genre filter if present
  if (genre && genre !== "Top") {
    url += `&with_genres=${genre}`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    // Map TMDB results to Stremio format
    const metas = data.results.map(item => ({
      id: `tmdb:${item.id}`,
      type,
      name: item.title || item.name,
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
      backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
      releaseInfo: item.release_date || item.first_air_date || null,
      overview: item.overview || "",
      imdb_id: item.imdb_id || null,
      genres: item.genre_ids || [],
      runtime: item.runtime || null,
    }));

    return { metas, cacheMaxAge: 3600 };
  } catch (error) {
    console.error("Error fetching TMDB catalog:", error);
    return { metas: [], cacheMaxAge: 300 };
  }
}

async function getMDBListCatalog(id, extraInputs, config) {
  // id format: mdblist_123456
  const listId = id.replace("mdblist_", "");
  const url = `${MDBLIST_BASE_URL}/lists/${listId}/items`;

  // If pagination supported, parse page from extraInputs
  let page = 1;
  if (extraInputs && extraInputs.length > 0) {
    const skipExtra = extraInputs.find(e => e.name === "skip");
    if (skipExtra) {
      page = skipExtra.value + 1;
    }
  }

  try {
    const res = await fetch(`${url}?page=${page}`, {
      headers: {
        Authorization: `Bearer ${config.mdblistkey || ""}`
      }
    });

    if (!res.ok) {
      throw new Error(`MDBList API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    if (!Array.isArray(json.items)) {
      return { metas: [], cacheMaxAge: 300 };
    }

    // Map MDBList items to Stremio metas
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

const { parseMDBListItem, parseMedia } = require("../utils/parseProps");

// Haalt alle lijsten op van de gebruiker (voor configpagina)
async function getMDBLists(mdblistkey) {
  try {
    const url = `https://api.mdblist.com/lists/user?apikey=${mdblistkey}`;
    console.log("[MDBList] Fetching user lists from:", url);

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[MDBList] Fetch error getting user lists:", errorText);
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    console.log("[MDBList] Fetched user lists:", data);

    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[MDBList] Error in getMDBLists():", err);
    return [];
  }
}

// Helper: Zoek TMDb-details via imdb_id
async function getTmdbDetailsByImdbId(imdbId, type, tmdbApiKey, language = "nl-NL") {
  try {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbApiKey}&language=${language}&external_source=imdb_id`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[TMDb] Lookup failed for ${imdbId}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();

    const results = type === "movie" ? data.movie_results : data.tv_results;
    return results && results.length > 0 ? results[0] : null;
  } catch (e) {
    console.error("[TMDb] Error in getTmdbDetailsByImdbId:", e);
    return null;
  }
}

// Haalt één specifieke MDBList lijst items op en returnt { metas: [] }
async function getMDBList(type, id, page, language, config) {
  const safeConfig = config || {};
  const mdblistkey = safeConfig.mdblistkey;
  const tmdbApiKey = safeConfig.tmdbApiKey;

  if (!mdblistkey) {
    console.error("[MDBList] User token ontbreekt in config:", config);
    return { metas: [] };
  }

  // ✅ Verwacht nu dat `id` direct het lijstnummer is, zoals '97574'
  if (!/^\d+$/.test(id)) {
    console.error("[MDBList] Ongeldig lijst-ID (verwacht getal):", id);
    return { metas: [] };
  }

  const url = `https://api.mdblist.com/lists/${id}/items?apikey=${mdblistkey}&append_to_response=genre,poster`;
  console.log(`[MDBList] Fetching list items from: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[MDBList] Error fetching list items:", errorText);
      return { metas: [] };
    }

    const data = await response.json();
    const itemsArray = type === "movie" ? data.movies : data.shows;

    if (!itemsArray || itemsArray.length === 0) {
      return { metas: [] };
    }

    // Gebruik direct de poster & genres uit MDBList indien aanwezig, fallback naar TMDb alleen als TMDb API key aanwezig is
    if (tmdbApiKey) {
      const metas = [];
      for (const item of itemsArray) {
        if (item.poster && item.genre) {
          metas.push(parseMDBListItem(item, type));
        } else if (item.imdb_id) {
          const tmdbDetails = await getTmdbDetailsByImdbId(item.imdb_id, type, tmdbApiKey, language);
          metas.push(tmdbDetails ? parseMedia(tmdbDetails, type) : parseMDBListItem(item, type));
        } else {
          metas.push(parseMDBListItem(item, type));
        }
      }
      return { metas };
    } else {
      const metas = itemsArray.map(item => parseMDBListItem(item, type));
      return { metas };
    }
  } catch (err) {
    console.error("[MDBList] Error in getMDBList():", err);
    return { metas: [] };
  }
}

module.exports = {
  getMDBLists,
  getMDBList
};

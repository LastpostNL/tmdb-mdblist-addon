const { parseMDBListItem, parseMedia } = require("../utils/parseProps");

// Haalt alle lijsten op van de gebruiker voor in de configpagina
async function getMDBLists(userToken) {
  try {
    const url = `https://api.mdblist.com/lists/user?apikey=${userToken}`;
    console.log("Fetching MDBList user lists from:", url);

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Fetch error while getting user lists:", errorText);
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    console.log("Fetched MDBList user lists:", data);

    // Return array of lists or empty array
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error in getMDBLists():", err);
    return [];
  }
}

// Helper: TMDb zoeken via imdb_id (krijgt TMDb ID)
async function getTmdbDetailsByImdbId(imdbId, type, tmdbApiKey, language = "nl-NL") {
  try {
    // Zoek TMDb-ID via external_id endpoint
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbApiKey}&language=${language}&external_source=imdb_id`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`TMDb lookup failed for ${imdbId}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();

    // Afhankelijk van type, zoek in movies of tv_results
    const results = type === "movie" ? data.movie_results : data.tv_results;
    if (results && results.length > 0) {
      return results[0]; // Eerste resultaat
    }
    return null;
  } catch (e) {
    console.error("Error in getTmdbDetailsByImdbId:", e);
    return null;
  }
}

// Haalt één specifieke lijst op en retourneert object { metas: [] }
async function getMDBList(type, id, page, language, config) {
  const listId = id;
  const safeConfig = config || {};
  const userToken = safeConfig.mdblistUserToken;
  const tmdbApiKey = safeConfig.tmdbApiKey; // TMDb API-key in config

  if (!userToken) {
    console.error("MDBList user token ontbreekt of config is niet meegegeven:", config);
    return { metas: [] };
  }

  const url = `https://api.mdblist.com/lists/${listId}/items?apikey=${userToken}`;
  console.log(`Fetching MDBList items from: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error fetching MDBList list items:", errorText);
      return { metas: [] };
    }

    const data = await response.json();
    const itemsArray = type === "movie" ? data.movies : data.shows;

    if (!itemsArray || itemsArray.length === 0) {
      return { metas: [] };
    }

    // Als TMDb API key beschikbaar is, haal TMDb details per item op voor rijke metadata
    if (tmdbApiKey) {
      const metas = [];

      for (const item of itemsArray) {
        if (item.imdb_id) {
          const tmdbDetails = await getTmdbDetailsByImdbId(item.imdb_id, type, tmdbApiKey, language);
          if (tmdbDetails) {
            metas.push(parseMedia(tmdbDetails, type));
            continue;
          }
        }
        // Fallback naar basis-parse als TMDb lookup niet lukt of imdb_id ontbreekt
        metas.push(parseMDBListItem(item, type));
      }
      return { metas };
    } else {
      // Zonder TMDb key gewoon de basisitems teruggeven
      const metas = itemsArray.map(item => parseMDBListItem(item, type));
      return { metas };
    }
  } catch (err) {
    console.error("Error in getMDBList():", err);
    return { metas: [] };
  }
}

module.exports = {
  getMDBLists,
  getMDBList
};

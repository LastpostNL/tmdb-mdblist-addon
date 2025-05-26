const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { parseMedia } = require("../utils/parseProps");

// Haalt alle lijsten op van de gebruiker voor in de configpagina
async function getMDBLists(userToken) {
  try {
    const url = `https://api.mdblist.com/lists/user?apikey=${userToken}`;
    console.log("Fetching from:", url);

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Fetch error:", errorText);
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    console.log("Fetched lists:", data);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error in getMDBLists():", err);
    return [];
  }
}

// Haalt één specifieke lijst op en retourneert metas[]
async function getMDBList(type, language, page, id, config) {
  const listId = id.replace("mdblist.", ""); // bijvoorbeeld: mdblist.my_list_123 → my_list_123
  const userToken = config.mdblistUserToken;

  if (!userToken) {
    console.error("MDBList user token is missing in config.");
    return { metas: [] };
  }

  const url = `https://api.mdblist.com/lists/user/${listId}?apikey=${userToken}`;
  console.log(`Fetching MDBList: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error fetching list:", errorText);
      return { metas: [] };
    }

    const data = await response.json();

    // Kies type 'movie' of 'show' op basis van entries in de lijst
    const filtered = (Array.isArray(data.items) ? data.items : []).filter(item => {
      return type === "movie" ? item.type === "movie" : item.type === "show";
    });

    const metas = filtered.map(item => parseMedia(item, type));

    return { metas };
  } catch (err) {
    console.error("Error in getMDBList():", err);
    return { metas: [] };
  }
}

module.exports = {
  getMDBLists,
  getMDBList
};

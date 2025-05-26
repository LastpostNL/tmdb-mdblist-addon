const { parseMedia } = require("../utils/parseProps");

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

// Haalt één specifieke lijst op en retourneert object { metas: [] }
async function getMDBList(type, id, page, language, config) {
  const listId = id;
  const safeConfig = config || {};
  const userToken = safeConfig.mdblistUserToken;

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
const metas = (itemsArray || []).map(item => parseMDBListItem(item, type));


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

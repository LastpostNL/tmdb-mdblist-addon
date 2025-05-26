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
async function getMDBList(type, language, page, id, config) {
  const listId = id.replace("mdblist.", ""); // prefix weghalen
  const userToken = config.mdblistUserToken;

  if (!userToken) {
    console.error("MDBList user token missing in config.");
    return { metas: [] };
  }

  const url = `https://api.mdblist.com/lists/user/${listId}?apikey=${userToken}`;
  console.log(`Fetching MDBList single list from: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error fetching MDBList list:", errorText);
      return { metas: [] };
    }

    const data = await response.json();

    // Filter items op type (movie/show)
    const filteredItems = (Array.isArray(data.items) ? data.items : []).filter(item => {
      return type === "movie" ? item.type === "movie" : item.type === "show";
    });

    const metas = filteredItems.map(item => parseMedia(item, type));

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

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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

module.exports = { getMDBLists }; // <== BELANGRIJK
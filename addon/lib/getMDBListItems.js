const { parseMDBListItemsToStremioItems } = require("./parseProps");

async function getMDBListItems({ listid, limit = 100, offset = 0, apikey, filter_genre, sort, order, unified = true }) {
  if (!apikey) {
    throw new Error("API key is required");
  }
  if (!listid) {
    throw new Error("listid is required");
  }

  const params = new URLSearchParams({
    limit,
    offset,
    apikey,
    unified,
  });

  if (filter_genre) params.append("filter_genre", filter_genre);
  if (sort) params.append("sort", sort);
  if (order) params.append("order", order);

  const url = `https://api.mdblist.com/list/${listid}/items?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MDBList API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  return parseMDBListItemsToStremioItems(data);
}

module.exports = getMDBListItems;

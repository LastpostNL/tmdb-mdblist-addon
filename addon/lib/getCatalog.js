require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const moviedb = new MovieDb(process.env.TMDB_API);
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { parseMedia } = require("../utils/parseProps");
const { getMDBList } = require("./getMDBList");
const CATALOG_TYPES = require("../static/catalog-types.json");

async function getCatalog(type, language, page, id, genre, config) {
  config = config || {};

  // Als id puur cijfers bevat => MDBList oproepen
  if (/^\d+$/.test(id)) {
    console.log(`[MDBList] getCatalog called with numeric id=${id}, type=${type}`);
    const result = await getMDBList(type, id, page, language, config);
    console.log(`[MDBList] getCatalog result: metas count=${result.metas.length}`);
    return result;
  }

  const genreList = await getGenreList(language, type);
  const parameters = await buildParameters(type, language, page, id, genre, genreList, config);

  const fetchFunction = type === "movie"
    ? moviedb.discoverMovie.bind(moviedb)
    : moviedb.discoverTv.bind(moviedb);

  return fetchFunction(parameters)
    .then(async (res) => {
      // Voor elk item extra trailers ophalen
      const resultsWithTrailers = await Promise.all(res.results.map(async (el) => {
        // Video's ophalen per media item
        const videos = type === "movie"
          ? await moviedb.movieVideos({ id: el.id })
          : await moviedb.tvVideos({ id: el.id });

        // Eerste YouTube trailer zoeken
        const trailerObj = videos.results.find(v => v.site === "YouTube" && v.type === "Trailer");
        const trailer = trailerObj ? `yt_id:${trailerObj.key}` : null;

        // Media parsen met trailer meegeven
        return parseMedia(el, type, genreList, trailer);
      }));

      return { metas: resultsWithTrailers };
    })
    .catch((err) => {
      console.error("Error in getCatalog:", err);
      return { metas: [] };
    });
}

async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages();
  const parameters = {
    language,
    page,
    'vote_count.gte': 10
  };

  if (config.ageRating) {
    switch (config.ageRating) {
      case "G":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? "G" : "TV-G";
        break;
      case "PG":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? "G|PG" : "TV-G|TV-PG";
        break;
      case "PG-13":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? "G|PG|PG-13" : "TV-G|TV-PG|TV-14";
        break;
      case "R":
        parameters.certification_country = "US";
        parameters.certification = type === "movie" ? "G|PG|PG-13|R" : "TV-G|TV-PG|TV-14|TV-MA";
        break;
      case "NC-17":
        // Geen filter
        break;
    }
  }

  if (id.startsWith("streaming.")) {
    const providerId = id.split(".")[1];
    const provider = findProvider(providerId);

    parameters.with_genres = genre ? findGenreId(genre, genreList) : undefined;
    parameters.with_watch_providers = provider.watchProviderId;
    parameters.watch_region = provider.country;
    parameters.with_watch_monetization_types = "flatrate|free|ads";
  } else {
    switch (id) {
      case "tmdb.top":
        parameters.with_genres = genre ? findGenreId(genre, genreList) : undefined;
        if (type === "series") {
          parameters.watch_region = language.split("-")[1];
          parameters.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
        }
        break;
      case "tmdb.year":
        const year = genre ? genre : new Date().getFullYear();
        parameters[type === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
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
  return language ? language.iso_639_1 : "";
}

function findProvider(providerId) {
  const provider = CATALOG_TYPES.streaming[providerId];
  if (!provider) throw new Error(`Could not find provider: ${providerId}`);
  return provider;
}

module.exports = { getCatalog };

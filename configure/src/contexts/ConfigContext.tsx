import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  baseCatalogs,
  authCatalogs,
  streamingCatalogs,
} from "@/data/catalogs";

export interface ListItem {
  id: number;
  name: string;
  description: string;
  mediatype: string;
  private: boolean;
}

export type CatalogConfig = {
  id: string;
  type: string;
  name?: string;
  showInHome: boolean;
  enabled: boolean;
};

export type ConfigContextType = {
  rpdbkey: string;
  mdblistkey: string;
  mdblistSelectedLists: number[];
  mdblistLists: ListItem[];
  includeAdult: boolean;
  provideImdbId: boolean;
  tmdbPrefix: boolean;
  hideEpisodeThumbnails: boolean;
  language: string;
  sessionId: string;
  streaming: string[];
  catalogs: CatalogConfig[];
  ageRating: string | undefined;
  searchEnabled: boolean;
  setRpdbkey: (rpdbkey: string) => void;
  setMdblistkey: (mdblistkey: string) => void;
  setMdblistSelectedLists: (lists: number[]) => void;
  setMdblistLists: (lists: ListItem[]) => void;
  setIncludeAdult: (includeAdult: boolean) => void;
  setProvideImdbId: (provideImdbId: boolean) => void;
  setTmdbPrefix: (tmdbPrefix: boolean) => void;
  setHideEpisodeThumbnails: (hideEpisodeThumbnails: boolean) => void;
  setLanguage: (language: string) => void;
  setSessionId: (sessionId: string) => void;
  setStreaming: (streaming: string[]) => void;
  setCatalogs: (
    catalogs: CatalogConfig[] | ((prev: CatalogConfig[]) => CatalogConfig[])
  ) => void;
  setAgeRating: (ageRating: string | undefined) => void;
  setSearchEnabled: (enabled: boolean) => void;
  loadConfigFromUrl: () => void;
};

export const ConfigContext = createContext<ConfigContextType | undefined>(
  undefined
);

const allCatalogs = [
  ...baseCatalogs,
  ...authCatalogs,
  ...Object.values(streamingCatalogs).flat(),
];

function filterAndMapMdblistCatalogs(
  currentCatalogs: CatalogConfig[],
  mdblistLists: ListItem[],
  mdblistSelectedLists: number[]
): CatalogConfig[] {
  const nonMdblistCatalogs = currentCatalogs.filter(
    (c) => !c.id.startsWith("mdblist.")
  );

  const mdblistCatalogs = mdblistLists
    .filter((list) => mdblistSelectedLists.includes(list.id))
    .flatMap((list) => {
      const existingMovie = currentCatalogs.find(
        (c) => c.id === `mdblist.movie.${list.id}`
      );
      const existingSeries = currentCatalogs.find(
        (c) => c.id === `mdblist.series.${list.id}`
      );

      const base = {
        name: list.name,
        enabled: true,
      };

      const result: CatalogConfig[] = [];

      if (list.mediatype === "movie") {
        result.push({
          id: `mdblist.movie.${list.id}`,
          type: "movie",
          showInHome: existingMovie?.showInHome ?? false,
          ...base,
        });
      }

      if (list.mediatype === "show") {
        result.push({
          id: `mdblist.series.${list.id}`,
          type: "series",
          showInHome: existingSeries?.showInHome ?? false,
          ...base,
        });
      }

      return result;
    });

  return [...nonMdblistCatalogs, ...mdblistCatalogs];
}

function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      if (state === undefined || state === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(state));
      }
    } catch {
      // localStorage error negeren
    }
  }, [key, state]);

  return [state, setState];
}

function loadConfigFromUrl(
  setRpdbkey: (key: string) => void,
  setMdblistkey: (key: string) => void,
  setMdblistSelectedLists: (lists: number[]) => void,
  setIncludeAdult: (includeAdult: boolean) => void,
  setLanguage: (language: string) => void,
  setCatalogs: (catalogs: CatalogConfig[]) => void,
  setStreaming: (streaming: string[]) => void,
  setSearchEnabled: (enabled: boolean) => void,
  loadDefaultCatalogs: () => void,
  allCatalogs: CatalogConfig[]
) {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const configParam = urlParams.get("config");

    if (!configParam) {
      console.warn("Geen JSON in queryparameter, fallback naar defaults.");
      loadDefaultCatalogs();
      return;
    }

    const config = JSON.parse(decodeURIComponent(configParam));
    console.debug("?? Gedeodeerde config string:", decodeURIComponent(configParam));
    console.debug("? Parsed config object:", config);

    if (config.rpdbkey) setRpdbkey(config.rpdbkey);
    if (config.mdblistkey) setMdblistkey(config.mdblistkey);
    if (config.mdblistSelectedLists && Array.isArray(config.mdblistSelectedLists)) {
      setMdblistSelectedLists(config.mdblistSelectedLists);
    }
    if (config.includeAdult) setIncludeAdult(config.includeAdult === "true");
    if (config.language) setLanguage(config.language);

    if (config.catalogs) {
      const catalogsWithNames = config.catalogs.map((catalog: CatalogConfig) => {
        const existingCatalog = allCatalogs.find(
          (c) => c.id === catalog.id && c.type === catalog.type
        );
        return {
          ...catalog,
          name: existingCatalog?.name || catalog.id,
          enabled: catalog.enabled || false,
        };
      });

      setCatalogs(catalogsWithNames);

      const selectedStreamingServices = new Set(
        catalogsWithNames
          .filter((catalog) => catalog.id.startsWith("streaming."))
          .map((catalog) => catalog.id.split(".")[1])
      );

      setStreaming(Array.from(selectedStreamingServices));
    } else {
      loadDefaultCatalogs();
    }

    if (config.searchEnabled) setSearchEnabled(config.searchEnabled === "true");
  } catch (error) {
    console.error("Error loading config from URL:", error);
    loadDefaultCatalogs();
  }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [rpdbkey, setRpdbkey] = useLocalStorageState<string>("rpdbkey", "");
  const [mdblistkey, setMdblistkey] = useLocalStorageState<string>("mdblistkey", "");
  const [mdblistSelectedLists, setMdblistSelectedLists] = useLocalStorageState<number[]>(
    "mdblistSelectedLists",
    []
  );
  const [mdblistListsState, _setMdblistLists] = useState<ListItem[]>([]);

  const [includeAdult, setIncludeAdult] = useState(false);
  const [provideImdbId, setProvideImdbId] = useState(false);
  const [tmdbPrefix, setTmdbPrefix] = useState(false);
  const [hideEpisodeThumbnails, setHideEpisodeThumbnails] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [sessionId, setSessionId] = useState("");
  const [streaming, setStreaming] = useState<string[]>([]);

  const [catalogs, setCatalogs] = useState<CatalogConfig[]>([]);
  const [ageRating, setAgeRating] = useState<string | undefined>(undefined);
  const [searchEnabled, setSearchEnabled] = useState(true);

  const setMdblistLists = (lists: ListItem[]) => {
    const uniqueLists = Array.from(
      new Map(lists.map((item) => [`${item.id}-${item.mediatype}`, item])).values()
    );
    _setMdblistLists(uniqueLists);
  };

  const loadDefaultCatalogs = () => {
    const defaultCatalogs = baseCatalogs.map((catalog) => ({
      ...catalog,
      enabled: true,
      showInHome: true,
    }));
    setCatalogs(defaultCatalogs);
  };

  useEffect(() => {
    loadConfigFromUrl(
      setRpdbkey,
      setMdblistkey,
      setMdblistSelectedLists,
      setIncludeAdult,
      setLanguage,
      setCatalogs,
      setStreaming,
      setSearchEnabled,
      loadDefaultCatalogs,
      allCatalogs
    );
  }, []);

  useEffect(() => {
    setCatalogs((currentCatalogs) =>
      filterAndMapMdblistCatalogs(currentCatalogs, mdblistListsState, mdblistSelectedLists)
    );
  }, [mdblistListsState, mdblistSelectedLists]);

  const value: ConfigContextType = {
    rpdbkey,
    mdblistkey,
    mdblistSelectedLists,
    mdblistLists: mdblistListsState,
    includeAdult,
    provideImdbId,
    tmdbPrefix,
    hideEpisodeThumbnails,
    language,
    sessionId,
    streaming,
    catalogs,
    ageRating,
    searchEnabled,
    setRpdbkey,
    setMdblistkey,
    setMdblistSelectedLists,
    setMdblistLists,
    setIncludeAdult,
    setProvideImdbId,
    setTmdbPrefix,
    setHideEpisodeThumbnails,
    setLanguage,
    setSessionId,
    setStreaming,
    setCatalogs,
    setAgeRating,
    setSearchEnabled,
    loadConfigFromUrl: () =>
      loadConfigFromUrl(
        setRpdbkey,
        setMdblistkey,
        setMdblistSelectedLists,
        setIncludeAdult,
        setLanguage,
        setCatalogs,
        setStreaming,
        setSearchEnabled,
        loadDefaultCatalogs,
        allCatalogs
      ),
  };

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig moet binnen ConfigProvider worden gebruikt");
  }
  return context;
}

import React, { createContext, useContext, useEffect, useState } from "react";
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

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [rpdbkey, setRpdbkey] = useState("");
  const [mdblistkey, setMdblistkey] = useState("");
  const [mdblistSelectedLists, setMdblistSelectedLists] = useState<number[]>([]);
  const [mdblistLists, setMdblistLists] = useState<ListItem[]>([]);
  const [includeAdult, setIncludeAdult] = useState(false);
  const [provideImdbId, setProvideImdbId] = useState(false);
  const [tmdbPrefix, setTmdbPrefix] = useState(false);
  const [hideEpisodeThumbnails, setHideEpisodeThumbnails] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [sessionId, setSessionId] = useState("");
  const [streaming, setStreaming] = useState<string[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogConfig[]>([]);
  const [ageRating, setAgeRating] = useState<string | undefined>(undefined);
  const [searchEnabled, setSearchEnabled] = useState<boolean>(true);

  const loadDefaultCatalogs = () => {
    const defaultCatalogs = baseCatalogs.map((catalog) => ({
      ...catalog,
      enabled: true,
      showInHome: true,
    }));
    setCatalogs(defaultCatalogs);
  };

  const loadConfigFromUrl = () => {
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
        const catalogsWithNames = config.catalogs.map((catalog) => {
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

        setStreaming(Array.from(selectedStreamingServices) as string[]);
      } else {
        loadDefaultCatalogs();
      }

      if (config.searchEnabled)
        setSearchEnabled(config.searchEnabled === "true");
    } catch (error) {
      console.error("Error loading config from URL:", error);
      loadDefaultCatalogs();
    }
  };

  // Load mdblistkey & mdblistSelectedLists from localStorage on first load (only if not in URL)
  useEffect(() => {
    const storedToken = localStorage.getItem("mdblistkey");
    if (storedToken && !mdblistkey) {
      console.debug("? Loaded token from localStorage:", storedToken);
      setMdblistkey(storedToken);
    }

    const storedLists = localStorage.getItem("mdblistSelectedLists");
    if (storedLists && !mdblistSelectedLists.length) {
      try {
        setMdblistSelectedLists(JSON.parse(storedLists));
      } catch {
        // ignore parse error
      }
    }
  }, []);

  // Persist mdblistkey to localStorage when it changes
  useEffect(() => {
    if (mdblistkey) {
      localStorage.setItem("mdblistkey", mdblistkey);
    } else {
      localStorage.removeItem("mdblistkey");
    }
  }, [mdblistkey]);

  // Persist mdblistSelectedLists to localStorage when it changes
  useEffect(() => {
    if (mdblistSelectedLists.length > 0) {
      localStorage.setItem("mdblistSelectedLists", JSON.stringify(mdblistSelectedLists));
    } else {
      localStorage.removeItem("mdblistSelectedLists");
    }
  }, [mdblistSelectedLists]);

  useEffect(() => {
    loadConfigFromUrl();
  }, []);

  const value: ConfigContextType = {
    rpdbkey,
    mdblistkey,
    mdblistSelectedLists,
    mdblistLists,
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
    loadConfigFromUrl,
  };

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);

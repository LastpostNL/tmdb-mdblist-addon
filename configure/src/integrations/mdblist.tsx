import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import { useConfig } from "../contexts/ConfigContext";

interface ListItem {
  id: number;
  name: string;
  description: string;
  mediatype: string;
  private: boolean;
}

interface SelectedMDBList {
  id: number;
  showInHome: boolean;
}

export default function MDBList() {
  const {
    mdblistkey,
    setMdblistkey,
    mdblistSelectedLists,
    setMdblistSelectedLists,
    setMdblistLists,
    catalogs,
    setCatalogs,
  } = useConfig();

  const [inputToken, setInputToken] = useState(mdblistkey || "");
  const [error, setError] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const fetchLists = async (key: string) => {
    setLoadingLists(true);
    try {
      const res = await fetch(`/mdblist/lists/user?apikey=${key}`);
      if (!res.ok) throw new Error("Getting the MDBList content failed.");

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid response from the server.");

      setLists(data);
      setMdblistLists(data);

      setError("");
      setIsValid(true);
    } catch (err) {
      setError((err as Error).message);
      setIsValid(false);
      setLists([]);
      setMdblistLists([]);
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    if (mdblistkey) {
      fetchLists(mdblistkey);
    } else {
      setLists([]);
      setMdblistLists([]);
      setIsValid(null);
    }
  }, [mdblistkey]);

  const handleSaveToken = () => {
    const trimmed = inputToken.trim();
    if (!trimmed) {
      setError("Token mag niet leeg zijn");
      return;
    }
    setMdblistkey(trimmed);
  };

  const handleLogout = () => {
    setMdblistkey("");
    setMdblistSelectedLists([]);
    setMdblistLists([]);
    setInputToken("");
    setLists([]);
    setIsValid(null);
  };

  // Helper: check of lijst geselecteerd is (return object of undefined)
  const findSelected = (id: number): SelectedMDBList | undefined =>
    mdblistSelectedLists.find((item) => item.id === id);

  // Toggle selectie van lijst (toevoegen/verwijderen)
  const toggleListSelection = (id: number) => {
    setMdblistSelectedLists((prev) => {
      const exists = prev.find((item) => item.id === id);
      if (exists) {
        // verwijderen
        return prev.filter((item) => item.id !== id);
      } else {
        // toevoegen met default showInHome false
        return [...prev, { id, showInHome: false }];
      }
    });
  };

  // Toggle showInHome per lijst
  const toggleShowInHome = (id: number) => {
    setMdblistSelectedLists((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, showInHome: !item.showInHome } : item
      )
    );
  };

  // **Belangrijk:** Synchroniseer mdblistSelectedLists naar de centrale config.catalogs
  useEffect(() => {
    if (!setCatalogs) return; // check

    // Filter bestaande catalogi zonder mdblist entries
    const nonMDBListCatalogs = catalogs.filter(
      (cat) => !cat.id.startsWith("mdblist_")
    );

    // Maak nieuwe mdblist catalog entries van de selectie
    const mdblistCatalogs = mdblistSelectedLists.map((item) => {
      // Zoek de lijst naam voor een nette titel
      const listData = lists.find((l) => l.id === item.id);
      return {
        id: `mdblist_${item.id}`,
        type: "catalog",
        name: listData ? `MDBList: ${listData.name}` : `MDBList ${item.id}`,
        extra: {
          mdblist_id: item.id,
          showInHome: item.showInHome,
          mediatype: listData?.mediatype || "movie",
        },
      };
    });

    // Update centrale catalogs in config
    setCatalogs([...nonMDBListCatalogs, ...mdblistCatalogs]);
  }, [mdblistSelectedLists, catalogs, lists, setCatalogs]);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isValid ? (
        <>
          <Alert>
            <AlertDescription>✅ You are logged in to MDBList</AlertDescription>
          </Alert>

          <div>
            <Label className="mb-2 font-semibold">Select your lists:</Label>
            {loadingLists ? (
              <div>Loading personal lists...</div>
            ) : lists.length === 0 ? (
              <div>No lists have been found.</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-auto border rounded p-2">
                {lists.map((list) => {
                  const selected = findSelected(list.id);
                  return (
                    <div
                      key={list.id}
                      className="flex items-center space-x-4 cursor-pointer"
                      title={list.description || ""}
                    >
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleListSelection(list.id)}
                        />
                        <span>
                          [{list.mediatype}] {list.name}{" "}
                          {list.private ? "(Private)" : ""}
                        </span>
                      </label>

                      {selected && (
                        <label className="flex items-center space-x-1">
                          <input
                            type="checkbox"
                            checked={selected.showInHome}
                            onChange={() => toggleShowInHome(list.id)}
                          />
                          <span>Show in Home</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogClose asChild>
            <Button variant="destructive" onClick={handleLogout} className="mt-4">
              Logout
            </Button>
          </DialogClose>
        </>
      ) : (
        <div className="space-y-4">
          <Label htmlFor="mdblistToken">MDBList API Token</Label>
          <Input
            id="mdblistToken"
            placeholder="Enter your API token"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
          />
          <Button onClick={handleSaveToken}>Login</Button>
        </div>
      )}
    </div>
  );
}

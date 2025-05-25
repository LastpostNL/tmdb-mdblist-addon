import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";

interface MDBListProps {
  config: Record<string, any>;
  onChange: (newPartialConfig: Record<string, any>) => void;
}

interface ListItem {
  id: number;
  name: string;
  description: string;
  mediatype: string;
  private: boolean;
}

const API_BASE = "https://api.mdblist.com";

export default function MDBList({ config, onChange }: MDBListProps) {
  const [inputToken, setInputToken] = useState(config.mdblistkey || "");
  const [error, setError] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [lists, setLists] = useState<ListItem[]>([]);

  // Selected lists that are saved in config
  const [selectedLists, setSelectedLists] = useState<number[]>(config.mdblistSelectedLists || []);
  // Pending selection controlled locally before saving
  const [pendingSelection, setPendingSelection] = useState<number[]>(selectedLists);
  const [loadingLists, setLoadingLists] = useState(false);

  const verifyToken = async (key: string) => {
    try {
      const url = `${API_BASE}/user?apikey=${key}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Verificatie mislukt");

      const data = await res.json();
      if (data && data.user_id) {
        setIsValid(true);
        setError("");
        return true;
      } else {
        throw new Error("Token ongeldig of geen gebruikersgegevens gevonden");
      }
    } catch (err) {
      setIsValid(false);
      setError("Invalid or expired token.");
      return false;
    }
  };

  const fetchLists = async (key: string) => {
    setLoadingLists(true);
    try {
      const url = `${API_BASE}/lists/user?apikey=${key}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch lists");

      const data = await res.json();
      setLists(Array.isArray(data) ? data : data.lists || []);
      setError("");
    } catch (err) {
      setError("Failed to load lists.");
      setLists([]);
    } finally {
      setLoadingLists(false);
    }
  };

  // Wanneer mdblistkey verandert, opnieuw token valideren en lijsten ophalen
  useEffect(() => {
    if (config.mdblistkey) {
      (async () => {
        const valid = await verifyToken(config.mdblistkey);
        if (valid) {
          await fetchLists(config.mdblistkey);
        } else {
          setLists([]);
          onChange({ mdblistSelectedLists: [] });
        }
      })();
    } else {
      setIsValid(null);
      setLists([]);
      setSelectedLists([]);
      setPendingSelection([]);
    }
  }, [config.mdblistkey]);

  // Als mdblistSelectedLists in config verandert, update lokale geselecteerde lijsten én pending selectie
  useEffect(() => {
    if (Array.isArray(config.mdblistSelectedLists)) {
      setSelectedLists(config.mdblistSelectedLists);
      setPendingSelection(config.mdblistSelectedLists);
    }
  }, [config.mdblistSelectedLists]);

  // Token opslaan via knop
  const handleSave = async () => {
    const trimmedToken = inputToken.trim();
    if (!trimmedToken) {
      setError("Token cannot be empty.");
      setIsValid(false);
      return;
    }

    const valid = await verifyToken(trimmedToken);
    if (valid) {
      onChange({ ...config, mdblistkey: trimmedToken });
      await fetchLists(trimmedToken);
    }
  };

  // Uitloggen: reset alles en notify parent
  const handleLogout = () => {
    onChange({ ...config, mdblistkey: "", mdblistSelectedLists: [] });
    setInputToken("");
    setIsValid(null);
    setLists([]);
    setSelectedLists([]);
    setPendingSelection([]);
  };

  // Lijsten aanvinken/verwijderen in lokale pending selectie
  const toggleListSelection = (id: number) => {
    const newSelection = pendingSelection.includes(id)
      ? pendingSelection.filter((x) => x !== id)
      : [...pendingSelection, id];
    setPendingSelection(newSelection);
  };

  // Pas hier pas selectie opslaan in config en notify parent
  const handleSaveSelection = () => {
    setSelectedLists(pendingSelection);
    onChange({ ...config, mdblistSelectedLists: pendingSelection });
  };

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
            <AlertDescription>You are logged in to MDBList</AlertDescription>
          </Alert>

          <div>
            <Label className="mb-2 font-semibold">Select your lists:</Label>
            {loadingLists ? (
              <div>Loading lists...</div>
            ) : lists.length === 0 ? (
              <div>No lists found.</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-auto border rounded p-2">
                {lists.map((list) => (
                  <label
                    key={list.id}
                    className="flex items-center space-x-2 cursor-pointer"
                    title={list.description || ""}
                  >
                    <input
                      type="checkbox"
                      checked={pendingSelection.includes(list.id)}
                      onChange={() => toggleListSelection(list.id)}
                    />
                    <span>
                      [{list.mediatype}] {list.name} {list.private ? "(Private)" : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <Button onClick={handleSaveSelection} className="mt-4 w-full">
              Opslaan selectie
            </Button>
          </div>

          <DialogClose asChild>
            <Button variant="destructive" onClick={handleLogout} className="mt-4">
              Logout
            </Button>
          </DialogClose>
        </>
      ) : (
        <div className="space-y-4">
          <Input
            type="text"
            placeholder="Enter MDBList token"
            className="w-full"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
          />
          <Button onClick={handleSave} className="w-full">
            Save Token
          </Button>
        </div>
      )}
    </div>
  );
}

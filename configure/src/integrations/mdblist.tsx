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

export default function MDBList() {
  const {
    mdblistkey,
    setMdblistkey,
    mdblistSelectedLists,
    setMdblistSelectedLists,
    setMdblistLists,      // toegevoegd hier
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
      if (!res.ok) throw new Error("Lijsten ophalen mislukt");

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Ongeldig antwoord van de server");

      setLists(data);
      setMdblistLists(data);

      setError("");
      setIsValid(true);
    } catch (err) {
      setError((err as Error).message);
      setIsValid(false);
      setLists([]);
      setMdblistLists([]);   // resetten bij error
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    if (mdblistkey) {
      fetchLists(mdblistkey);
    } else {
      setLists([]);
      setMdblistLists([]);    // ook leegmaken als geen token
      setIsValid(null);
    }
  }, [mdblistkey, setMdblistLists]);

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
    setMdblistLists([]);   // ook context resetten bij uitloggen
    setInputToken("");
    setLists([]);
    setIsValid(null);
  };

  const toggleListSelection = (id: number) => {
    setMdblistSelectedLists((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
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
            <AlertDescription>✅ Je bent ingelogd bij MDBList</AlertDescription>
          </Alert>

          <div>
            <Label className="mb-2 font-semibold">Selecteer je lijsten:</Label>
            {loadingLists ? (
              <div>Lijsten laden...</div>
            ) : lists.length === 0 ? (
              <div>Geen lijsten gevonden.</div>
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
                      checked={mdblistSelectedLists.includes(list.id)}
                      onChange={() => toggleListSelection(list.id)}
                    />
                    <span>
                      [{list.mediatype}] {list.name} {list.private ? "(Private)" : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogClose asChild>
            <Button variant="destructive" onClick={handleLogout} className="mt-4">
              Uitloggen
            </Button>
          </DialogClose>
        </>
      ) : (
        <div className="space-y-4">
          <Label htmlFor="mdblistToken">MDBList API Token</Label>
          <Input
            id="mdblistToken"
            placeholder="Voer je API token in"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
          />
          <Button onClick={handleSaveToken}>Inloggen</Button>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useConfig } from "@/contexts/ConfigContext";

type MDBList = {
  id: number;
  name: string;
};

export const MDBListSelection = () => {
  const { mdblistkey, mdblistSelectedLists, setMdblistSelectedLists } = useConfig();
  const [availableLists, setAvailableLists] = useState<MDBList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mdblistkey) {
      setAvailableLists([]);
      return;
    }
    setLoading(true);
    fetch(`/mdblist/lists/user?apikey=${mdblistkey}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load MDBList lists");
        return res.json();
      })
      .then((data: MDBList[]) => {
        setAvailableLists(data);
        setError(null);
      })
      .catch((e) => {
        setError(e.message);
        setAvailableLists([]);
      })
      .finally(() => setLoading(false));
  }, [mdblistkey]);

  const toggleList = (id: number) => {
    if (mdblistSelectedLists.includes(id)) {
      setMdblistSelectedLists(mdblistSelectedLists.filter((listId) => listId !== id));
    } else {
      setMdblistSelectedLists([...mdblistSelectedLists, id]);
    }
  };

  if (!mdblistkey) return <p>Log eerst in bij MDBList om lijsten te zien.</p>;

  if (loading) return <p>Laden van je lijsten...</p>;

  if (error) return <p>Fout bij laden van lijsten: {error}</p>;

  if (availableLists.length === 0) return <p>Geen persoonlijke lijsten gevonden.</p>;

  return (
    <div>
      <h3>Kies welke MDBList lijsten je wil gebruiken:</h3>
      <ul>
        {availableLists.map(({ id, name }) => (
          <li key={id}>
            <label>
              <input
                type="checkbox"
                checked={mdblistSelectedLists.includes(id)}
                onChange={() => toggleList(id)}
              />{" "}
              {name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

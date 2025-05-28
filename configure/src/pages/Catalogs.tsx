import { useEffect } from "react";
import { useConfig } from "@/contexts/ConfigContext";
import { baseCatalogs, authCatalogs, streamingCatalogs } from "@/data/catalogs";
import { 
  DndContext, 
  DragEndEvent, 
  closestCenter,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors 
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableCatalogCard } from "@/components/SortableCatalogCard";

const CatalogColumn = ({
  title,
  catalogs,
  catalogConfigs,
  onCatalogChange,
  onDragEnd,
  sensors
}) => (
  <div className="flex flex-col gap-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter} 
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={catalogs.map((c) => `${c.id}-${c.type}`)}
        strategy={verticalListSortingStrategy}
      >
        {catalogs.map((catalog) => (
          <SortableCatalogCard
            key={`${catalog.id}-${catalog.type}`}
            id={`${catalog.id}-${catalog.type}`}
            catalog={catalog}
            name={catalog.name} 
            config={catalogConfigs[`${catalog.id}-${catalog.type}`] || {enabled: false, showInHome: false}}
            onChange={(enabled, showInHome) => 
              onCatalogChange(catalog.id, catalog.type, enabled, showInHome)
            }
          />
        ))}
      </SortableContext>
    </DndContext>
  </div>
);

const Catalogs = () => {
  const { 
    sessionId, 
    mdblistkey, 
    streaming, 
    catalogs, 
    setCatalogs, 
    mdblistLists, 
    mdblistSelectedLists 
  } = useConfig();

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10,
    },
  });
  
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  useEffect(() => {
    const mdblistCatalogs = mdblistLists
      .filter(list => mdblistSelectedLists.includes(list.id))
      .map(list => ({
        id: `mdblist.${list.id}`,
        name: list.name,
        type: list.mediatype === "movie" ? "movie" : "series",
      }));

    const allCatalogs = [
      ...baseCatalogs,
      ...(sessionId ? authCatalogs : []),
      ...mdblistCatalogs,
      ...(streaming?.length
        ? streaming.flatMap((serviceId) => streamingCatalogs[serviceId] || [])
        : []),
    ];

    setCatalogs((prev) => {
      const existingMap = new Map(prev.map(c => [`${c.id}-${c.type}`, c]));

      // Filter catalogi die nog relevant zijn
      const filteredPrev = prev.filter(c =>
        allCatalogs.some(ac => ac.id === c.id && ac.type === c.type)
      );

      // Nieuwe catalogi toevoegen met standaard enabled/showInHome false
      const newCatalogs = allCatalogs
        .filter(c => !existingMap.has(`${c.id}-${c.type}`))
        .map(c => ({
          ...c,
          enabled: false,
          showInHome: false,
        }));

      return [
        ...filteredPrev,
        ...newCatalogs,
      ];
    });
  }, [sessionId, streaming, mdblistLists, mdblistSelectedLists, setCatalogs]);

  // **Hier: geen filter op enabled** want je moet ook uitgeschakelde kunnen aanvinken
  const allCatalogs = catalogs;

  // Map config per catalogus voor checkboxes, standaard false als niet aanwezig
  const catalogConfigs = allCatalogs.reduce((acc, config) => {
    const key = `${config.id}-${config.type}`;
    acc[key] = {
      enabled: config.enabled ?? false,
      showInHome: config.showInHome ?? false,
    };
    return acc;
  }, {});

  const handleCatalogChange = (catalogId, type, enabled, showInHome) => {
    setCatalogs((prev) => {
      // Map door de catalogi, wijzig degene die matcht
      return prev.map((c) =>
        c.id === catalogId && c.type === type
          ? { ...c, enabled: enabled === true, showInHome }
          : c
      );
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCatalogs((prev) => {
      const oldIndex = prev.findIndex((c) => `${c.id}-${c.type}` === active.id);
      const newIndex = prev.findIndex((c) => `${c.id}-${c.type}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <main className="md:p-12 px-2 py-12">
      <div className="flex flex-col mb-6">
        <h1 className="text-xl font-semibold mb-1">Catalogs</h1>
        <p className="text-gray-500 text-sm">Manage the catalogs available in the addon.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CatalogColumn
          title="Movies"
          catalogs={allCatalogs.filter((c) => c.type === "movie")}
          catalogConfigs={catalogConfigs}
          onCatalogChange={handleCatalogChange}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        />
        <CatalogColumn
          title="TV Shows"
          catalogs={allCatalogs.filter((c) => c.type === "series")}
          catalogConfigs={catalogConfigs}
          onCatalogChange={handleCatalogChange}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        />
      </div>
    </main>
  );
};

export default Catalogs;

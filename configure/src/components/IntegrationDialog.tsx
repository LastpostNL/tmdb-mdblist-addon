import { lazy, Suspense } from "react";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfig } from "@/contexts/ConfigContext";

const integrationMap: Record<string, () => Promise<any>> = {
  tmdb: () => import("@/integrations/tmdb"),
  rpdb: () => import("@/integrations/rpdb"),
  streaming: () => import("@/integrations/streaming"),
  mdblist: () => import("@/integrations/mdblist"),
};

interface IntegrationDialogProps {
  id: string;
  name: string;
  icon: string;
}

export function IntegrationDialog({ id, name, icon }: IntegrationDialogProps) {
  const {
    rpdbkey,
    mdblistkey,
    includeAdult,
    language,
    setMdblistkey,
    setRpdbkey,
    setIncludeAdult,
    setLanguage,
  } = useConfig(); // <-- haalt alles uit context

  const config = {
    rpdbkey,
    mdblistkey,
    includeAdult,
    language,
  };

  const handleChange = (newPartialConfig: Record<string, any>) => {
    if ("rpdbkey" in newPartialConfig) setRpdbkey(newPartialConfig.rpdbkey);
    if ("mdblistkey" in newPartialConfig) setMdblistkey(newPartialConfig.mdblistkey);
    if ("includeAdult" in newPartialConfig) setIncludeAdult(newPartialConfig.includeAdult);
    if ("language" in newPartialConfig) setLanguage(newPartialConfig.language);
  };

  const IntegrationComponent = lazy(() =>
    integrationMap[id]?.().catch((err) => {
      console.error(`Failed to load integration component for '${id}':`, err);
      return import("./DefaultIntegration");
    })
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <img src={icon} alt={name} className="w-5 h-5 sm:w-6 sm:h-6" />
          {name} Configuration
        </DialogTitle>
        <DialogDescription className="text-sm sm:text-base">
          Configure your {name} integration settings below.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:gap-4">
        <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
          <IntegrationComponent config={config} onChange={handleChange} />
        </Suspense>
      </div>
    </>
  );
}
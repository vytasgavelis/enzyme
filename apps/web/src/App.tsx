import { FlaskConical } from "lucide-react";
import { Navigate, Outlet } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/features/searches/sidebar";
import { useSearches } from "@/lib/queries";

/** Sidebar of saved searches on the left, the selected search's feed on the right. */
export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-screen grid-cols-[264px_minmax(0,1fr)] bg-page text-foreground">
        <Sidebar />
        <main className="min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}

/** `/`: open the first search, or explain what to do when there are none. */
export function Home() {
  const searches = useSearches();
  if (searches.isPending) return null;
  const first = searches.data?.[0];
  if (first) return <Navigate to={`/searches/${first.id}`} replace />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <FlaskConical className="size-8 text-green-700" />
      <h2 className="font-semibold text-lg">Start with a search</h2>
      <p className="max-w-sm text-muted-foreground text-sm">
        Add a topic you follow with <span className="font-medium">+ New</span> in the sidebar.
        Enzyme collects the matching papers and shows them here.
      </p>
    </div>
  );
}

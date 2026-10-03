import { stripHtml } from "@enzyme/shared";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.api.health.$get()).json(),
  });

  const papers = useQuery({
    queryKey: ["papers"],
    queryFn: async () => (await api.api.papers.$get()).json(),
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">Enzyme</h1>
        <Badge variant={health.data?.ok ? "secondary" : "destructive"}>
          {health.isLoading ? "checking API…" : health.data?.ok ? "API ok" : "API down"}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Papers</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {papers.data?.map((p) => (
              <li key={p.id} className="py-2">
                <span className="mr-2 font-mono text-muted-foreground text-xs">
                  {p.pmid ?? p.sourceId}
                </span>
                {p.title === null ? "(untitled)" : stripHtml(p.title)}
              </li>
            ))}
            {papers.data?.length === 0 && (
              <li className="py-2 text-muted-foreground">No papers yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function App() {
  const queryClient = useQueryClient();
  const [pmid, setPmid] = useState("");
  const [title, setTitle] = useState("");

  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.api.health.$get()).json(),
  });

  const papers = useQuery({
    queryKey: ["papers"],
    queryFn: async () => (await api.api.papers.$get()).json(),
  });

  const addPaper = useMutation({
    mutationFn: async () => {
      const res = await api.api.papers.$post({ json: { pmid, title } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      setPmid("");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
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
          <CardTitle>Add a paper</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPaper.mutate();
            }}
          >
            <Input
              className="w-32"
              placeholder="PMID"
              value={pmid}
              onChange={(e) => setPmid(e.target.value)}
            />
            <Input
              className="flex-1"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" disabled={addPaper.isPending || !pmid || !title}>
              Add
            </Button>
          </form>
          {addPaper.isError && (
            <p className="mt-2 text-destructive text-sm">{addPaper.error.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Papers</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {papers.data?.map((p) => (
              <li key={p.pmid} className="py-2">
                <span className="mr-2 font-mono text-muted-foreground text-xs">{p.pmid}</span>
                {p.title}
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

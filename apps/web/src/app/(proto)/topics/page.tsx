"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type Topic = {
  id: string;
  name: string;
  count: number;
};

type Thread = {
  id: string;
  title: string;
  topicId: string;
  updated: string;
  owner: string;
  tone: "neutral" | "brand" | "warning" | "success";
};

const DEFAULT_TOPICS: Topic[] = [
  { id: "t-attendance", name: "Attendance", count: 14 },
  { id: "t-ingestion", name: "Ingestion", count: 9 },
  { id: "t-approvals", name: "Approvals", count: 6 },
  { id: "t-a11y", name: "Accessibility", count: 4 },
];

const THREADS: Thread[] = [
  {
    id: "1842",
    title: "Attendance export mismatch",
    topicId: "t-attendance",
    updated: "4m ago",
    owner: "Mira",
    tone: "warning",
  },
  {
    id: "1841",
    title: "Webhook retries spiking",
    topicId: "t-ingestion",
    updated: "18m ago",
    owner: "Kaito",
    tone: "brand",
  },
  {
    id: "1837",
    title: "SSO login errors",
    topicId: "t-ingestion",
    updated: "1h ago",
    owner: "Nia",
    tone: "warning",
  },
  {
    id: "1829",
    title: "Operator deploy approval flow",
    topicId: "t-approvals",
    updated: "2h ago",
    owner: "Darshan",
    tone: "neutral",
  },
] as const;

export default function TopicsPage() {
  const [topics, setTopics] = React.useState<Topic[]>(DEFAULT_TOPICS);
  const [selected, setSelected] = React.useState<string>(DEFAULT_TOPICS[0].id);
  const [newTopic, setNewTopic] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");

  const filteredThreads = THREADS.filter((t) => t.topicId === selected);

  function createTopic() {
    const name = newTopic.trim();
    if (!name) return;
    const id = `t-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const next: Topic = { id, name, count: 0 };
    setTopics((cur) => [next, ...cur]);
    setSelected(id);
    setNewTopic("");
  }

  function startRename(t: Topic) {
    setRenamingId(t.id);
    setRenameValue(t.name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) return;
    setTopics((cur) =>
      cur.map((t) => (t.id === renamingId ? { ...t, name } : t))
    );
    setRenamingId(null);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-4">
      {/* Topics list */}
      <div className="col-span-12 min-h-0 lg:col-span-4">
        <Card className="h-full min-h-0">
          <CardHeader>
            <CardTitle>Topics</CardTitle>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Tags with thread counts + management (prototype)
            </div>
          </CardHeader>
          <CardContent className="min-h-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Create a topic…"
                  aria-label="Create topic"
                />
                <Button variant="primary" onClick={createTopic}>
                  Create
                </Button>
              </div>

              <div className="space-y-2 overflow-auto pr-2 lg:max-h-[560px]">
                {topics.map((t) => {
                  const active = selected === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelected(t.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl p-4 text-left ring-1 transition",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
                        active
                          ? "bg-brand-50 ring-brand-100 dark:bg-brand-500/10 dark:ring-brand-500/20"
                          : "bg-white ring-line hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                      )}
                      aria-pressed={active}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {t.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t.count} threads
                        </div>
                      </div>
                      <Badge tone="neutral">{t.count}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Threads filtered */}
      <div className="col-span-12 min-h-0 lg:col-span-8">
        <Card className="h-full min-h-0">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Threads</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Filtered by topic
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const t = topics.find((x) => x.id === selected);
                if (!t) return null;

                if (renamingId === t.id) {
                  return (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        aria-label="Rename topic"
                      />
                      <Button variant="primary" onClick={commitRename}>
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{t.name}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => startRename(t)}>
                      Rename
                    </Button>
                  </div>
                );
              })()}
            </div>
          </CardHeader>

          <CardContent className="min-h-0">
            <div className="space-y-2">
              {filteredThreads.map((th) => (
                <div
                  key={th.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-line hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      #{th.id} — {th.title}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Updated {th.updated} • Owner: {th.owner}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={th.tone as any}>{th.tone}</Badge>
                    <ButtonLink href={`/inspect/${th.id}`} size="sm" variant="ghost">
                      Inspect
                    </ButtonLink>
                  </div>
                </div>
              ))}

              {filteredThreads.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:ring-slate-800">
                  No threads found for this topic.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ThreadsPage() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Threads</CardTitle>
              <div className="mt-1 text-xs text-muted">
                Recent activity (prototype)
              </div>
            </div>
            <Button size="sm" variant="secondary">
              Filter
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { id: "#1842", title: "Attendance export mismatch", tone: "warning" },
                { id: "#1841", title: "Webhook retries spiking", tone: "brand" },
                { id: "#1839", title: "Agent memory pressure", tone: "neutral" },
                { id: "#1837", title: "SSO login errors", tone: "warning" },
              ].map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-line hover:bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {t.id} — {t.title}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Updated 4m ago • Owner: Mira
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={t.tone as any}>{t.tone}</Badge>
                    <Button size="sm" variant="ghost">
                      Open
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

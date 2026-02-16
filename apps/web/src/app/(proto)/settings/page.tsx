import ThemeToggle from "@/components/proto/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-7">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <div className="mt-1 text-xs text-muted">Prototype configuration</div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Workspace name
                </div>
                <div className="mt-2">
                  <Input defaultValue="Support" />
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Default region
                </div>
                <div className="mt-2">
                  <Input defaultValue="us-east" />
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Theme
                </div>
                <div className="mt-2">
                  <ThemeToggle size="md" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Save</Button>
                <Button variant="secondary">Reset</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="col-span-12 lg:col-span-5">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-200 dark:prose-invert">
              <p>
                This is a high-fidelity UI prototype for UX review. Components are
                Tailwind-based and mimic shadcn/ui styling.
              </p>
              <p>
                Focus areas: information hierarchy, whitespace, subtle hover states,
                and a clean three-pane layout.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

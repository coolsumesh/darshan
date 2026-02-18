import AppShell from "@/components/proto/app-shell";
import { ProjectProvider } from "@/lib/project-context";

export default function ProtoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProjectProvider>
      <AppShell>{children}</AppShell>
    </ProjectProvider>
  );
}

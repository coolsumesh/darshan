import AppShell from "@/components/proto/app-shell";

export default function ProtoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}

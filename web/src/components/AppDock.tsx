import { Database, Globe, House } from "lucide-react";
import { useLocation } from "react-router-dom";
import { FloatingDock } from "@/components/ui/floating-dock";
import type { DockItem } from "@/components/ui/floating-dock";

export function AppDock({ onOpenSources }: { onOpenSources: () => void }) {
  const { pathname } = useLocation();
  if (pathname.startsWith("/atlas")) return null;
  const items: DockItem[] = [
    { title: "Home", href: "/", icon: <House />, current: pathname === "/" },
    {
      title: "Atlas",
      href: "/atlas",
      icon: <Globe />,
      current: pathname.startsWith("/atlas"),
    },
    { title: "Sources", onClick: onOpenSources, icon: <Database /> },
  ];
  return (
    <div
      className="fixed bottom-0 left-1/2 z-40 -translate-x-1/2"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <FloatingDock items={items} ariaLabel="Primary" />
    </div>
  );
}

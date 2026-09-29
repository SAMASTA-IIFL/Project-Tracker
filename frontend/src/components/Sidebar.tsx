import { useNavigate } from "react-router-dom";
import { Home, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function SidebarAction({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border border-sidebar-border/60 bg-card/40 px-4 py-3 text-left text-sm font-medium text-sidebar-foreground transition-[transform,background-color] duration-instant ease-apple-out hover:bg-card/70 active:scale-[0.98]",
      )}
    >
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      {shortcut && <span className="text-xs text-muted-foreground">{shortcut}</span>}
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();

  return (
    <aside className="glass-sidebar relative z-10 hidden w-64 shrink-0 flex-col justify-between p-4 md:flex">
      <div className="flex flex-col gap-2">
        <SidebarAction icon={<Home className="h-4 w-4" />} label="Dashboard" shortcut="⌘D" onClick={() => navigate("/")} />
        <SidebarAction
          icon={<Plus className="h-4 w-4" />}
          label="New product"
          shortcut="⌘N"
          onClick={() => navigate("/products/new")}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="px-1 text-xs text-muted-foreground">Product Pro v0.1.0</p>
      </div>
    </aside>
  );
}

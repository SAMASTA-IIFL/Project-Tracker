import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="glass relative z-20 flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
        <Link to="/" className="text-sm font-semibold tracking-tight">
          Product Pro
        </Link>
        {user && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                signOut();
                navigate("/sign-in");
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name ?? user.email}</span>
            <Avatar label={user.name ?? user.email} />
          </div>
        )}
      </header>

      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

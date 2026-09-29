import { useEffect, useRef, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { api } from "@/lib/api";
import type { VaultUserSearchResult } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

// Platform-wide user search + chip picker for granting Secrets Vault access.
// Unlike AssigneePicker (which picks from an already-known, bounded list of
// product members), a vault owner can grant access to *any* user on the
// platform, so this searches live via GET /api/users?q=.
export function UserPicker({
  selected,
  onChange,
  excludeIds = [],
}: {
  selected: VaultUserSearchResult[];
  onChange: (users: VaultUserSearchResult[]) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VaultUserSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api
        .get<VaultUserSearchResult[]>(`/api/users?q=${encodeURIComponent(trimmed)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addUser(u: VaultUserSearchResult) {
    if (!u.vault_public_key) return;
    if (selected.some((s) => s.id === u.id)) return;
    onChange([...selected, u]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function removeUser(id: string) {
    onChange(selected.filter((u) => u.id !== id));
  }

  const visibleResults = results.filter((r) => !excludeIds.includes(r.id) && !selected.some((s) => s.id === r.id));

  return (
    <div className="flex flex-col gap-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-accent/40 py-0.5 pl-1 pr-2 text-xs"
            >
              <Avatar label={u.name ?? u.email} className="h-5 w-5 text-[9px]" />
              {u.name ?? u.email}
              <button
                type="button"
                onClick={() => removeUser(u.id)}
                aria-label={`Remove ${u.name ?? u.email}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="relative">
        <Input
          placeholder="Search people by name or email..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="text-xs"
        />
        {open && query.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-3">
            {visibleResults.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matching users.</p>
            ) : (
              visibleResults.map((u) => {
                const noVault = !u.vault_public_key;
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={noVault}
                    onClick={() => addUser(u)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <Avatar label={u.name ?? u.email} className="h-5 w-5 text-[9px]" />
                      {u.name ?? u.email}
                    </span>
                    {noVault && (
                      <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                        <KeyRound className="h-3 w-3" />
                        hasn't set up vault
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

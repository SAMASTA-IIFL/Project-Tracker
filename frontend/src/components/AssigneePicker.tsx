import { X } from "lucide-react";
import type { ProductDetail } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";

// Reusable chip picker for multi-assignee fields: selected members render as
// removable chips, and a <Select> below offers whichever members aren't
// selected yet. Used anywhere a Task is created or edited (Tasks.tsx,
// Planning.tsx) — Infosec checklist items keep their own single-assignee
// picker since that's a different entity/permission model.
export function AssigneePicker({
  members,
  selectedIds,
  onChange,
}: {
  members: ProductDetail["members"];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedMembers = selectedIds
    .map((id) => members.find((m) => m.user.id === id))
    .filter((m): m is ProductDetail["members"][number] => Boolean(m));
  const remaining = members.filter((m) => !selectedIds.includes(m.user.id));

  function addAssignee(id: string) {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
  }

  function removeAssignee(id: string) {
    onChange(selectedIds.filter((existing) => existing !== id));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedMembers.map((m) => (
            <span
              key={m.user.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-accent/40 py-0.5 pl-1 pr-2 text-xs"
            >
              <Avatar label={m.user.name ?? m.user.email} className="h-5 w-5 text-[9px]" />
              {m.user.name ?? m.user.email}
              <button
                type="button"
                onClick={() => removeAssignee(m.user.id)}
                aria-label={`Remove ${m.user.name ?? m.user.email}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {remaining.length > 0 && (
        <Select value="" onChange={(e) => addAssignee(e.target.value)} className="text-xs">
          <option value="">
            {selectedMembers.length === 0 ? "Unassigned — add someone..." : "+ Add another assignee..."}
          </option>
          {remaining.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name ?? m.user.email}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

// Shared chrome for every segmented-control-style tab strip (Tabs, ModuleNav)
// so they read as the same control app-wide. Literal strings only (Tailwind
// v4's scanner needs whole tokens, never interpolation).
export const SEGMENTED_TRACK =
  "glass-thin relative flex flex-wrap items-center gap-1 rounded-full border border-border/40 p-1";
export const SEGMENTED_ITEM =
  "relative z-10 rounded-full font-medium transition-colors duration-fast ease-apple-out";
export const SEGMENTED_ITEM_ACTIVE = "text-foreground";
export const SEGMENTED_ITEM_INACTIVE = "text-muted-foreground hover:text-foreground";
export const SEGMENTED_INDICATOR =
  "absolute inset-y-1 rounded-full bg-[image:var(--grad-primary)] transition-[left,width,opacity] duration-base ease-apple-out";

// Shared "selected list row" treatment — was an identical inline ternary
// repeated verbatim in BRD.tsx, Uat.tsx, and Bugs.tsx; extracted so all three
// pick up the same glass highlight and can't drift apart.
export const SELECTED_ROW_ACTIVE = "border-primary/60 bg-accent glass-thin shadow-1";
export const SELECTED_ROW_INACTIVE = "border-border hover:bg-accent/50";

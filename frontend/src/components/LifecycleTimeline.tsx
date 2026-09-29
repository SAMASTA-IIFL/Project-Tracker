import { Asterisk, Check } from "lucide-react";
import { STAGES, type LifecycleStage, type StageTaskStatus } from "@/lib/types";
import { STAGE_META } from "@/lib/stages";
import { cn } from "@/lib/utils";

export function LifecycleTimeline({
  currentStage,
  stageTaskStatus,
}: {
  currentStage: LifecycleStage;
  /** Per-stage task rollup — lets a stage ahead of `currentStage` that's already
   * complete keep its "done" look (with a flag) instead of reverting to gray
   * when an earlier stage reopens. See lib/stages.ts's computeStageTaskStatus. */
  stageTaskStatus?: Partial<Record<LifecycleStage, StageTaskStatus>>;
}) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);
  const segments = STAGES.length - 1;
  const progressPct = currentIndex <= 0 ? 0 : (currentIndex / segments) * 100;

  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative flex min-w-[720px] items-start justify-between px-5 pt-1">
        <div className="absolute left-10 right-10 top-6 h-0.5 bg-border" />
        <div
          className="absolute left-10 top-6 h-0.5 bg-gradient-to-r from-stage-intake via-stage-development to-stage-release"
          style={{ width: progressPct === 0 ? 0 : `calc(${progressPct}% - ${Math.round((progressPct / 100) * 20)}px)` }}
        />

        {STAGES.map((stage, i) => {
          const meta = STAGE_META[stage.key];
          const Icon = meta.icon;
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const doneAhead = i > currentIndex && stageTaskStatus?.[stage.key] === "complete";
          const state = isDone || doneAhead ? "done" : isCurrent ? "current" : "upcoming";

          const [gradA, gradB] = meta.gradient;

          return (
            <div key={stage.key} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
              <div
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-base ease-apple-out",
                  state === "upcoming" && "border-2 border-border bg-muted text-muted-foreground",
                  state === "current" && "scale-110",
                )}
                style={
                  state === "current"
                    ? { background: `conic-gradient(from 180deg, ${gradA}, ${gradB}, ${gradA})`, boxShadow: `0 0 22px -4px ${gradB}` }
                    : state === "done"
                      ? { backgroundImage: `linear-gradient(135deg, ${gradA}, ${gradB})` }
                      : undefined
                }
                title={doneAhead ? "Completed, but an earlier stage was reopened — worth a re-check" : undefined}
              >
                {state === "current" ? (
                  <div className="flex h-[calc(100%-6px)] w-[calc(100%-6px)] items-center justify-center rounded-full bg-card text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                ) : state === "done" ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {doneAhead && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-amber-500 text-white shadow-1">
                    <Asterisk className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
              <span
                title={stage.label}
                className={cn(
                  "max-w-[6rem] truncate text-xs font-medium leading-tight",
                  state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

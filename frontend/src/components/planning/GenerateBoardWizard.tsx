import { useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls } from "@xyflow/react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { ArchGraph, ArchNodeData, BoardGenerateResponse, BRD } from "@/lib/types";
import { ArchNode } from "@/components/planning/ArchNode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Node } from "@xyflow/react";

const nodeTypes = { archNode: ArchNode };

// The wizard's guided questions compose into one free-text prompt — the
// backend's contract (POST board/generate) is deliberately just
// {prompt, use_brd}, same "structure, not a form schema" shape as Planning's
// existing "Suggest tasks" AI feature. Asking a few targeted questions here
// produces a much better prompt than one bare textarea would, without the
// backend needing to understand a rigid Q&A shape.
export function GenerateBoardWizard({
  productId,
  onApply,
  onClose,
}: {
  productId: string;
  onApply: (graph: ArchGraph) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [what, setWhat] = useState("");
  const [ai, setAi] = useState("");
  const [integrations, setIntegrations] = useState("");
  const [infra, setInfra] = useState("");
  const [useBrd, setUseBrd] = useState(false);
  const [approvedBrd, setApprovedBrd] = useState<BRD | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ArchGraph | null>(null);

  useEffect(() => {
    api.get<BRD[]>(`/api/products/${productId}/brd`).then((brds) => {
      const latest = brds.length > 0 ? brds.reduce((a, b) => (a.version > b.version ? a : b)) : null;
      if (latest?.status === "APPROVED") setApprovedBrd(latest);
    });
  }, [productId]);

  function buildPrompt() {
    const parts = [`Building: ${what.trim() || "a software system"}.`];
    if (ai.trim()) parts.push(`AI/ML components: ${ai.trim()}.`);
    if (integrations.trim()) parts.push(`Key integrations or third-party services: ${integrations.trim()}.`);
    if (infra.trim()) parts.push(`Infrastructure needs: ${infra.trim()}.`);
    return parts.join(" ");
  }

  async function generate() {
    if (!what.trim()) {
      toast.error("Describe what you're building first");
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post<BoardGenerateResponse>(`/api/products/${productId}/workspace/board/generate`, {
        prompt: buildPrompt(),
        use_brd: useBrd,
      });
      setResult(res.graph_json);
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate a diagram");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-thick flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Generate architecture with AI</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "form" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">What are you building?</label>
                <Textarea
                  rows={2}
                  placeholder="e.g. A mobile checkout app for an e-commerce platform"
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Any AI/ML components?</label>
                <Input
                  placeholder="e.g. Fraud detection model, recommendation engine (optional)"
                  value={ai}
                  onChange={(e) => setAi(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Key integrations or third-party services?</label>
                <Input
                  placeholder="e.g. Stripe for payments, Twilio for SMS (optional)"
                  value={integrations}
                  onChange={(e) => setIntegrations(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Any specific infrastructure needs?</label>
                <Input
                  placeholder="e.g. Redis caching, a message queue, a CDN (optional)"
                  value={infra}
                  onChange={(e) => setInfra(e.target.value)}
                />
              </div>
              {approvedBrd && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={useBrd} onChange={(e) => setUseBrd(e.target.checked)} className="h-4 w-4" />
                  Use the approved BRD ({approvedBrd.title}) as additional context
                </label>
              )}
            </div>
          ) : (
            result && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Preview — apply to load this onto the board, then edit it like any other node/connection.
                </p>
                <div className="h-80 overflow-hidden rounded-lg border border-border">
                  <ReactFlowProvider>
                    <ReactFlow
                      nodes={result.nodes as Node<ArchNodeData>[]}
                      edges={result.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label }))}
                      nodeTypes={nodeTypes}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      elementsSelectable={false}
                      colorMode="dark"
                      fitView
                    >
                      <Background />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  </ReactFlowProvider>
                </div>
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          {step === "form" ? (
            <>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" className="gap-1.5" disabled={generating} onClick={generate}>
                <Sparkles className="h-3.5 w-3.5" />
                {generating ? "Generating..." : "Generate"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep("form")}>
                Back
              </Button>
              <Button type="button" variant="outline" disabled={generating} onClick={generate}>
                {generating ? "Generating..." : "Regenerate"}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (result) onApply(result);
                  onClose();
                }}
              >
                Apply to board
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

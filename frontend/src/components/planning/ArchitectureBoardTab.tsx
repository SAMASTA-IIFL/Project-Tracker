import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { History, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import {
  ARCH_NODE_CATEGORIES,
  type ArchEdgeData,
  type ArchEdgeKind,
  type ArchGraph,
  type ArchitectureBoard,
  type ArchitectureBoardVersion,
  type ArchNodeCategory,
  type ArchNodeData,
  type HostingEnvironment,
  type TechStackItem,
} from "@/lib/types";
import { ArchNode } from "@/components/planning/ArchNode";
import { GenerateBoardWizard } from "@/components/planning/GenerateBoardWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const nodeTypes = { archNode: ArchNode };

const EDGE_KIND_STYLE: Record<ArchEdgeKind, { stroke: string; dashed: boolean; animated: boolean }> = {
  SYNC: { stroke: "#5E5CE6", dashed: false, animated: false }, // Apple indigo
  ASYNC: { stroke: "#FF9F0A", dashed: true, animated: true }, // Apple orange
  DATA: { stroke: "#8E8E93", dashed: false, animated: false }, // Apple gray-1
};

function toFlowEdge(e: ArchGraph["edges"][number]): Edge {
  const style = EDGE_KIND_STYLE[e.data.kind] ?? EDGE_KIND_STYLE.DATA;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    data: e.data,
    animated: style.animated,
    style: { stroke: style.stroke, strokeDasharray: style.dashed ? "6 4" : undefined },
  };
}

export function ArchitectureBoardTab({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  return (
    <ReactFlowProvider>
      <BoardInner productId={productId} canEdit={canEdit} />
    </ReactFlowProvider>
  );
}

function BoardInner({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [board, setBoard] = useState<ArchitectureBoard | null>(null);
  const [techItems, setTechItems] = useState<TechStackItem[]>([]);
  const [hostingEnvs, setHostingEnvs] = useState<HostingEnvironment[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ArchNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<ArchitectureBoardVersion[] | null>(null);
  const [previewVersion, setPreviewVersion] = useState<ArchitectureBoardVersion | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    api.get<ArchitectureBoard>(`/api/products/${productId}/workspace/board`).then((b) => {
      setBoard(b);
      setNodes(b.graph_json.nodes.map((n) => ({ ...n })) as Node<ArchNodeData>[]);
      setEdges(b.graph_json.edges.map(toFlowEdge));
      // Set after the state above so the autosave effect's own "just loaded"
      // guard (below) sees the load as the render that follows this one.
      loaded.current = true;
    });
    api.get<TechStackItem[]>(`/api/products/${productId}/workspace/tech-stack`).then(setTechItems);
    api.get<HostingEnvironment[]>(`/api/products/${productId}/workspace/hosting`).then(setHostingEnvs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Autosave lives here, not inline in each handler that touches nodes/edges —
  // calling a side effect (scheduling a fetch) from inside a setNodes/setEdges
  // updater is impure and StrictMode's dev-mode double-invoke of updater
  // functions will run it twice. Watching the committed nodes/edges state is
  // the correct place for a side effect keyed on that state.
  useEffect(() => {
    if (!canEdit || !loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const graph_json: ArchGraph = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: "archNode",
          position: n.position,
          data: n.data as ArchNodeData,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: typeof e.label === "string" ? e.label : undefined,
          data: (e.data as ArchEdgeData) ?? { kind: "DATA" },
        })),
      };
      try {
        await api.patch(`/api/products/${productId}/workspace/board`, { graph_json });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not autosave the board");
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, canEdit, productId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      const edge: Edge = {
        id: crypto.randomUUID(),
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        data: { kind: "DATA" } satisfies ArchEdgeData,
        style: { stroke: EDGE_KIND_STYLE.DATA.stroke },
      };
      setEdges((current) => addEdge(edge, current));
    },
    [canEdit, setEdges],
  );

  function addNode(category: ArchNodeCategory) {
    const label = ARCH_NODE_CATEGORIES.find((c) => c.key === category)?.label ?? "Node";
    const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const node: Node<ArchNodeData> = {
      id: crypto.randomUUID(),
      type: "archNode",
      position,
      data: { label, category },
    };
    setNodes((current) => [...current, node]);
  }

  function updateSelectedNode(patch: Partial<ArchNodeData>) {
    setNodes((current) =>
      current.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }

  function updateSelectedEdge(patch: Partial<ArchEdgeData> & { label?: string }) {
    setEdges((current) =>
      current.map((e) => {
        if (e.id !== selectedEdgeId) return e;
        const data = { ...(e.data as ArchEdgeData), ...patch };
        const style = EDGE_KIND_STYLE[data.kind];
        return {
          ...e,
          data,
          label: patch.label !== undefined ? patch.label : e.label,
          animated: style.animated,
          style: { stroke: style.stroke, strokeDasharray: style.dashed ? "6 4" : undefined },
        };
      }),
    );
  }

  function deleteSelected() {
    if (selectedNodeId) {
      setNodes((current) => current.filter((n) => n.id !== selectedNodeId));
      setEdges((current) => current.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      setEdges((current) => current.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }

  // Used by the AI wizard's "Apply to board" — replaces the whole graph in
  // one shot; the autosave effect above picks up the change like any other edit.
  // Confirms first if there's existing work, since this is a wholesale
  // replace, not a merge.
  function applyGeneratedGraph(graph: ArchGraph) {
    if (nodes.length > 0 && !window.confirm("Replace the current board with the generated diagram?")) {
      return;
    }
    setNodes(graph.nodes.map((n) => ({ ...n })) as Node<ArchNodeData>[]);
    setEdges(graph.edges.map(toFlowEdge));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  async function saveVersion() {
    try {
      const version = await api.post<ArchitectureBoardVersion>(`/api/products/${productId}/workspace/board/versions`, {});
      toast.success(`Saved version ${version.version}`);
      setVersions(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save a version");
    }
  }

  function toggleHistory() {
    setShowHistory((v) => !v);
    if (!versions) {
      api.get<ArchitectureBoardVersion[]>(`/api/products/${productId}/workspace/board/versions`).then(setVersions);
    }
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

  if (!board) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {canEdit ? (saving ? "Saving..." : "Autosaves as you edit") : "Read-only — you can pan and zoom, not edit"}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={toggleHistory}>
            <History className="h-3.5 w-3.5" />
            History
          </Button>
          {canEdit && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setShowWizard(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </Button>
          )}
          {canEdit && (
            <Button type="button" size="sm" className="gap-1.5" onClick={saveVersion}>
              <Save className="h-3.5 w-3.5" />
              Save version
            </Button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Version history</p>
          {versions === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions saved yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setPreviewVersion(v)}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span>
                    v{v.version}
                    {v.label ? ` — ${v.label}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.saved_by.name ?? v.saved_by.email} · {new Date(v.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[160px_1fr_260px]">
        {canEdit && (
          <div className="flex flex-row flex-wrap gap-1.5 lg:flex-col">
            {ARCH_NODE_CATEGORIES.map((c) => (
              <Button
                key={c.key}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                onClick={() => addNode(c.key)}
              >
                + {c.label}
              </Button>
            ))}
          </div>
        )}

        <div className={cn("h-[560px] overflow-hidden rounded-xl border border-border", !canEdit && "lg:col-start-1")}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            onNodeClick={(_, n) => {
              setSelectedNodeId(n.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdgeId(e.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            colorMode="dark"
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-background" />
          </ReactFlow>
        </div>

        {(selectedNode || selectedEdge) && (
          <div className="rounded-xl border border-border p-4">
            {selectedNode && (
              <NodeInspector
                key={selectedNode.id}
                data={selectedNode.data}
                canEdit={canEdit}
                techItems={techItems}
                hostingEnvs={hostingEnvs}
                onChange={updateSelectedNode}
                onDelete={canEdit ? deleteSelected : undefined}
                onClose={() => setSelectedNodeId(null)}
              />
            )}
            {selectedEdge && (
              <EdgeInspector
                key={selectedEdge.id}
                data={(selectedEdge.data as ArchEdgeData) ?? { kind: "DATA" }}
                label={typeof selectedEdge.label === "string" ? selectedEdge.label : ""}
                canEdit={canEdit}
                onChange={updateSelectedEdge}
                onDelete={canEdit ? deleteSelected : undefined}
                onClose={() => setSelectedEdgeId(null)}
              />
            )}
          </div>
        )}
      </div>

      {previewVersion && (
        <VersionPreview version={previewVersion} onClose={() => setPreviewVersion(null)} />
      )}

      {showWizard && (
        <GenerateBoardWizard
          productId={productId}
          onApply={applyGeneratedGraph}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

function NodeInspector({
  data,
  canEdit,
  techItems,
  hostingEnvs,
  onChange,
  onDelete,
  onClose,
}: {
  data: ArchNodeData;
  canEdit: boolean;
  techItems: TechStackItem[];
  hostingEnvs: HostingEnvironment[];
  onChange: (patch: Partial<ArchNodeData>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Node</p>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Close" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input value={data.label} disabled={!canEdit} onChange={(e) => onChange({ label: e.target.value })} placeholder="Label" />
      <Select value={data.category} disabled={!canEdit} onChange={(e) => onChange({ category: e.target.value as ArchNodeCategory })}>
        {ARCH_NODE_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
      <Textarea
        rows={3}
        placeholder="Description (optional)"
        disabled={!canEdit}
        value={data.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">Linked tech stack item</label>
        <Select
          disabled={!canEdit}
          value={data.techItemId ?? ""}
          onChange={(e) => onChange({ techItemId: e.target.value || null })}
        >
          <option value="">None</option>
          {techItems.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">Linked hosting environment</label>
        <Select
          disabled={!canEdit}
          value={data.hostingEnvId ?? ""}
          onChange={(e) => onChange({ hostingEnvId: e.target.value || null })}
        >
          <option value="">None</option>
          {hostingEnvs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </div>
      {onDelete && (
        <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
          Delete node
        </Button>
      )}
    </div>
  );
}

const EDGE_KINDS: { key: ArchEdgeKind; label: string }[] = [
  { key: "SYNC", label: "Sync (REST/gRPC)" },
  { key: "ASYNC", label: "Async (event/queue)" },
  { key: "DATA", label: "Data flow" },
];

function EdgeInspector({
  data,
  label,
  canEdit,
  onChange,
  onDelete,
  onClose,
}: {
  data: ArchEdgeData;
  label: string;
  canEdit: boolean;
  onChange: (patch: Partial<ArchEdgeData> & { label?: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Connection</p>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Close" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input value={label} disabled={!canEdit} onChange={(e) => onChange({ label: e.target.value })} placeholder="Label (optional)" />
      <Select value={data.kind} disabled={!canEdit} onChange={(e) => onChange({ kind: e.target.value as ArchEdgeKind })}>
        {EDGE_KINDS.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </Select>
      {onDelete && (
        <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
          Delete connection
        </Button>
      )}
    </div>
  );
}

function VersionPreview({ version, onClose }: { version: ArchitectureBoardVersion; onClose: () => void }) {
  const nodes = version.graph_json.nodes as Node<ArchNodeData>[];
  const edges = version.graph_json.edges.map(toFlowEdge);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div
        className="flex items-center justify-between bg-white/10 p-4 backdrop-blur-md transition-colors duration-base ease-apple-out"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-white">
          Version {version.version}
          {version.label ? ` — ${version.label}` : ""} (read-only preview)
        </p>
        <Button type="button" variant="outline" size="icon" aria-label="Close preview" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="h-full overflow-hidden rounded-xl border border-border bg-background">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
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
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";

import type { SchemaEdge, SchemaGraph as Graph, SchemaNode } from "../lib/types";

/**
 * The relational graph.
 *
 * Nodes are tables, edges are the real foreign keys the backend read from
 * ``pg_constraint``. The layout is computed here, deterministically, from the
 * dependency depth of each table: tables nothing references sit on the left,
 * and each referencing table sits one column to the right of what it points
 * at. Nothing about the arrangement is hardcoded, so the picture follows the
 * schema.
 *
 * Hover a table to isolate its relationships; the rest dims. Pan by dragging
 * the background; zoom with the buttons, Ctrl/Cmd+wheel, or a two-finger
 * pinch. A plain scroll is left to the page, and the SVG opts out of the
 * browser's page pinch-zoom so the gesture stays inside the graph.
 */

export function SchemaGraph({ graph }: { graph: Graph }) {
  const [hovered, setHovered] = useState<string | null>(null);
  // Start fully zoomed in; the Reset button returns here, not to 1x.
  const [zoom, setZoom] = useState(MAX_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  // Touch state: one finger pans, two fingers pinch-zoom the graph (not the page).
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => layoutGraph(graph), [graph]);

  // "Home" is max zoom, top-centred: the drawing's top-centre sits just below
  // the header, so the first columns land fully in view. Solved exactly from
  // the measured frame and the meet-fitted drawing (CSS zoom holds the frame
  // centre, so this offset is stable at any frame size). Reset returns here.
  const goHome = () => {
    const el = frameRef.current;
    setZoom(MAX_ZOOM);
    if (!el) {
      setPan({ x: 0, y: 0 });
      return;
    }
    // Meet-fitting centres the drawing, so x needs no offset; y puts the
    // drawing's top edge just below the header.
    const fh = el.clientHeight;
    const s = Math.min(el.clientWidth / layout.width, fh / layout.height);
    const oy = (fh - layout.height * s) / 2;
    setPan({
      x: 0,
      y: Math.round(24 - fh / 2 - (oy - fh / 2) * MAX_ZOOM),
    });
  };

  useEffect(() => {
    goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const neighbours = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>([hovered]);
    for (const e of graph.edges) {
      if (e.source_table === hovered) set.add(e.target_table);
      if (e.target_table === hovered) set.add(e.source_table);
    }
    return set;
  }, [hovered, graph.edges]);

  const edgeActive = (e: SchemaEdge) =>
    hovered === null || e.source_table === hovered || e.target_table === hovered;

  return (
    <div className="overflow-hidden rounded-md border border-rule">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <span className="text-[0.875rem] font-semibold">Relational graph</span>
        <div className="flex items-center gap-2">
          <span className="tnum text-[0.8125rem] text-faint">
            {graph.nodes.length} tables / {graph.edges.length} relationships
          </span>
          <button
            type="button"
            className="btn btn-ghost h-7 w-7 px-0"
            onClick={() => setZoom((z) => clampZoom(z - 0.15))}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            type="button"
            className="btn btn-ghost h-7 w-7 px-0"
            onClick={() => setZoom((z) => clampZoom(z + 0.15))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-ghost h-7 px-2 text-[0.6875rem]"
            onClick={goHome}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        className="relative h-[78vh] min-h-[720px] cursor-grab overflow-hidden bg-paper active:cursor-grabbing"
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
        }}
        onMouseUp={() => {
          dragRef.current = null;
        }}
        onMouseLeave={() => {
          dragRef.current = null;
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            const t = e.touches[0];
            touchRef.current = { x: t.clientX - pan.x, y: t.clientY - pan.y };
            pinchRef.current = null;
          } else if (e.touches.length === 2) {
            touchRef.current = null;
            pinchRef.current = { dist: touchDistance(e.touches), zoom };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1 && touchRef.current) {
            const t = e.touches[0];
            setPan({ x: t.clientX - touchRef.current.x, y: t.clientY - touchRef.current.y });
          } else if (e.touches.length === 2 && pinchRef.current) {
            const ratio = touchDistance(e.touches) / (pinchRef.current.dist || 1);
            setZoom(clampZoom(pinchRef.current.zoom * ratio));
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length === 0) {
            touchRef.current = null;
            pinchRef.current = null;
          }
        }}
        onWheel={(e) => {
          // Trackpad pinch reports ctrlKey; a real Ctrl/Cmd+wheel is also a
          // zoom intent. A plain scroll is not: let the page scroll normally.
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => clampZoom(z - e.deltaY * 0.002));
        }}
      >
        <div
          className="h-full w-full"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
        <svg
          className="h-full w-full touch-none"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <g>
            {/* Edges first, so boxes sit on top of the lines. */}
            {graph.edges.map((e, i) => {
              const from = layout.anchors.get(`R:${e.source_table}.${e.source_column}`);
              const to = layout.anchors.get(`L:${e.target_table}.${e.target_column}`);
              if (!from || !to) return null;
              const dim = !edgeActive(e);
              const hot = hovered !== null && edgeActive(e);
              // A gentle S-curve reads as a relationship, not a wire crossing.
              const midX = (from.x + to.x) / 2;
              const d = `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
              return (
                <path
                  key={`${e.name}-${i}`}
                  d={d}
                  fill="none"
                  className={hot ? "stroke-signal" : "stroke-ink"}
                  strokeWidth={hot ? 2 : 1.25}
                  opacity={dim ? 0.08 : hot ? 0.95 : 0.4}
                  markerEnd={hot ? "url(#arrow-hot)" : "url(#arrow)"}
                />
              );
            })}

            <defs>
              <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" className="fill-ink" opacity="0.5" />
              </marker>
              <marker id="arrow-hot" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" className="fill-signal" />
              </marker>
            </defs>

            {layout.nodes.map((n) => {
              const dim = neighbours !== null && !neighbours.has(n.name);
              return (
                <TableBox
                  key={n.name}
                  box={n}
                  dim={dim}
                  active={hovered === n.name}
                  onEnter={() => setHovered(n.name)}
                  onLeave={() => setHovered(null)}
                />
              );
            })}
          </g>
        </svg>
        </div>

        <p className="pointer-events-none absolute bottom-3 left-4 text-[0.8125rem] text-faint">
          Drag to pan / Ctrl or pinch to zoom / hover a table to isolate it
        </p>
      </div>
    </div>
  );
}

const MAX_ZOOM = 2;
const MIN_ZOOM = 0.4;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +z.toFixed(2)));
}

function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function TableBox({
  box,
  dim,
  active,
  onEnter,
  onLeave,
}: {
  box: LaidOutNode;
  dim: boolean;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const rowHeight = 24;
  const headerHeight = 32;
  const height = headerHeight + box.columns.length * rowHeight + 6;

  return (
    <g
      transform={`translate(${box.x} ${box.y})`}
      opacity={dim ? 0.18 : 1}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ cursor: "pointer" }}
    >
      <rect
        width={box.width}
        height={height}
        className={active ? "fill-paper stroke-signal" : "fill-paper stroke-ink"}
        strokeWidth={active ? 2.5 : 2}
      />
      {/* Header band in the recessed surface tone; the title is ink, not inverted. */}
      <rect width={box.width} height={headerHeight} className="fill-surface" />
      <rect y={headerHeight} width={box.width} height={1} className="fill-rule" />
      <text
        x={12}
        y={21}
        className="fill-ink"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {box.name}
      </text>
      <text
        x={box.width - 12}
        y={21}
        textAnchor="end"
        className="fill-muted"
        style={{ fontSize: 11, opacity: 0.7 }}
      >
        {box.rows}
      </text>

      {box.columns.map((c, i) => {
        const y = headerHeight + i * rowHeight;
        return (
          <g key={c.name}>
            <text
              x={c.is_foreign_key || c.is_primary_key ? 30 : 14}
              y={y + 16}
              className="fill-ink font-mono"
              style={{ fontSize: 12.5 }}
            >
              {c.name}
            </text>
            {c.is_primary_key && (
              <text x={12} y={y + 16} className="fill-signal" style={{ fontSize: 11, fontWeight: 700 }}>
                PK
              </text>
            )}
            {c.is_foreign_key && (
              <text x={12} y={y + 16} className="fill-signal" style={{ fontSize: 11, fontWeight: 700 }}>
                FK
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---- layout ----

interface LaidOutNode {
  name: string;
  rows: number;
  columns: SchemaNode["columns"];
  x: number;
  y: number;
  width: number;
}

interface Layout {
  nodes: LaidOutNode[];
  anchors: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

const ROW = 24;
const HEADER = 32;
const NODE_W = 240;
const COL_GAP = 160;
const ROW_GAP = 34;
const PAD = 48;

/**
 * Depth of each table: a table that nothing points at is depth 0; a table that
 * points at depth-N tables is depth N+1. Cycles fall back to depth 0 so the
 * layout always terminates.
 */
function depthOf(nodes: SchemaNode[], edges: SchemaEdge[]): Map<string, number> {
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.source_table === e.target_table) continue;
    const list = parentsOf.get(e.source_table) ?? [];
    list.push(e.target_table);
    parentsOf.set(e.source_table, list);
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (name: string): number => {
    if (depth.has(name)) return depth.get(name) as number;
    if (visiting.has(name)) return 0; // cycle: stop, treat as a root
    visiting.add(name);
    const parents = parentsOf.get(name) ?? [];
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(walk));
    visiting.delete(name);
    depth.set(name, d);
    return d;
  };

  for (const n of nodes) walk(n.name);
  return depth;
}

function layoutGraph(graph: Graph): Layout {
  const depth = depthOf(graph.nodes, graph.edges);

  // Group tables into columns by depth.
  const columns = new Map<number, SchemaNode[]>();
  for (const n of graph.nodes) {
    const d = depth.get(n.name) ?? 0;
    const list = columns.get(d) ?? [];
    list.push(n);
    columns.set(d, list);
  }

  // Order within a column by name so the drawing is stable run to run.
  for (const list of columns.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const nodes: LaidOutNode[] = [];
  const anchors = new Map<string, { x: number; y: number }>();

  const depths = [...columns.keys()].sort((a, b) => a - b);
  // Column height is set by the tallest column, so rows line up across columns.
  let maxStack = 0;
  for (const d of depths) {
    const list = columns.get(d) ?? [];
    const total = list.reduce((sum, n) => sum + HEADER + n.columns.length * ROW + 6 + ROW_GAP, 0);
    maxStack = Math.max(maxStack, total);
  }

  let maxX = 0;
  for (const d of depths) {
    const list = columns.get(d) ?? [];
    const x = PAD + d * (NODE_W + COL_GAP);
    maxX = Math.max(maxX, x + NODE_W);
    let y = PAD;
    for (const n of list) {
      const height = HEADER + n.columns.length * ROW + 6;
      nodes.push({ name: n.name, rows: n.rows, columns: n.columns, x, y, width: NODE_W });

      // Anchor each column at its row centre. Two anchors per column: the
      // right edge (edges leave here) and the left edge (edges arrive here).
      n.columns.forEach((c, i) => {
        const cy = y + HEADER + i * ROW + ROW / 2;
        anchors.set(`R:${n.name}.${c.name}`, { x: x + NODE_W, y: cy });
        anchors.set(`L:${n.name}.${c.name}`, { x, y: cy });
      });
      y += height + ROW_GAP;
    }
  }

  return { nodes, anchors, width: maxX + PAD, height: Math.max(maxStack + PAD * 2, 620) };
}

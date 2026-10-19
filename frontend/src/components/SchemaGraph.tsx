import { useEffect, useMemo, useRef, useState } from "react";

import type { SchemaEdge, SchemaGraph as Graph, SchemaNode } from "../lib/types";

/**
 * The relational graph.
 *
 * Nodes are tables, edges are the real foreign keys the backend read from
 * ``pg_constraint``. Tables are laid out in horizontal domain lanes —
 * identity, skills, projects — so the grouping is readable at a glance
 * instead of being inferred from where the boxes happen to land.
 *
 * The domain map is a hint, not a whitelist: a table it does not mention lands
 * in an "Other" lane, so a new table appears the moment a migration creates it.
 * Row counts, columns, and edges all come from the live catalog.
 *
 * Hover a table to isolate its relationships; the rest dims. Pan by dragging
 * the background; zoom with the buttons, Ctrl/Cmd+wheel, or a two-finger
 * pinch. A plain scroll is left to the page, and the SVG opts out of the
 * browser's page pinch-zoom so the gesture stays inside the graph.
 */

export function SchemaGraph({ graph }: { graph: Graph }) {
  const [hovered, setHovered] = useState<string | null>(null);
  // The visible window, in SVG user units. Zoom and pan are both expressed by
  // moving this rectangle, which keeps the maths exact: no CSS transform means
  // no ambiguity about which point the browser scales around.
  const [view, setView] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  // Touch state: one finger pans, two fingers pinch-zoom the graph (not the page).
  const touchRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; view: typeof view } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => layoutGraph(graph), [graph]);

  // Fit the drawing's width to the frame and pin the top. A wide swimlane
  // layout is then fully visible side to side and scrolls down lane by lane.
  const goHome = () => {
    const el = frameRef.current;
    if (!el) return;
    const fw = el.clientWidth;
    const fh = el.clientHeight;
    // Width fits exactly; height follows the frame's aspect ratio.
    const h = (layout.width * fh) / Math.max(1, fw);
    setView({ x: 0, y: 0, w: layout.width, h });
  };

  useEffect(() => {
    goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width]);

  /** Zoom by `factor` (>1 zooms in) keeping the client point (cx, cy) fixed. */
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = cx === undefined ? rect.width / 2 : cx - rect.left;
    const py = cy === undefined ? rect.height / 2 : cy - rect.top;
    setView((v) => {
      const nextW = clampWidth(v.w / factor, layout.width);
      const real = v.w / nextW;
      const nextH = v.h / real;
      // The point under the cursor, in user units, must stay put.
      const ux = v.x + (px / Math.max(1, rect.width)) * v.w;
      const uy = v.y + (py / Math.max(1, rect.height)) * v.h;
      return {
        x: ux - (px / Math.max(1, rect.width)) * nextW,
        y: uy - (py / Math.max(1, rect.height)) * nextH,
        w: nextW,
        h: nextH,
      };
    });
  };

  const panBy = (dxClient: number, dyClient: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setView((v) => ({
      ...v,
      x: v.x - (dxClient / Math.max(1, rect.width)) * v.w,
      y: v.y - (dyClient / Math.max(1, rect.height)) * v.h,
    }));
  };

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
            onClick={() => zoomAt(1 / 1.25)}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            type="button"
            className="btn btn-ghost h-7 w-7 px-0"
            onClick={() => zoomAt(1.25)}
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
        className="relative h-[78vh] min-h-[720px] cursor-grab touch-none overflow-hidden bg-paper active:cursor-grabbing"
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        }}
        onMouseMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          panBy(e.clientX - d.x, e.clientY - d.y);
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
            touchRef.current = { x: t.clientX, y: t.clientY, vx: view.x, vy: view.y };
            pinchRef.current = null;
          } else if (e.touches.length === 2) {
            touchRef.current = null;
            pinchRef.current = { dist: touchDistance(e.touches), view };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1 && touchRef.current) {
            const t = e.touches[0];
            panBy(t.clientX - touchRef.current.x, t.clientY - touchRef.current.y);
          } else if (e.touches.length === 2 && pinchRef.current) {
            const ratio = touchDistance(e.touches) / (pinchRef.current.dist || 1);
            setView(pinchRef.current.view);
            zoomAt(ratio);
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
          zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY);
        }}
      >
        <svg
          className="h-full w-full touch-none"
          viewBox={`${view.x} ${view.y} ${view.w || layout.width} ${view.h || layout.height}`}
          preserveAspectRatio="xMidYMin slice"
        >
          <g>
            {/* Lanes first: they are the backdrop the cards sit on. */}
            {layout.lanes.map((lane) => (
              <g key={lane.label}>
                <rect
                  x={lane.x}
                  y={lane.y}
                  width={lane.width}
                  height={lane.height}
                  rx={10}
                  className="fill-surface stroke-rule"
                />
                <text
                  x={lane.x + 16}
                  y={lane.y + 24}
                  className="fill-muted"
                  style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8 }}
                >
                  {lane.label.toUpperCase()}
                </text>
              </g>
            ))}

            {/* Edges next, so boxes sit on top of the lines. */}
            {graph.edges.map((e, i) => {
              // Pick the facing sides so the line leaves the card it comes from
              // and arrives at the card it points to, whichever is further left.
              // Cards in a swimlane sit side by side, so a fixed right-to-left
              // route would double back through both boxes.
              const srcCol = layout.anchors.get(`R:${e.source_table}.${e.source_column}`);
              const srcColL = layout.anchors.get(`L:${e.source_table}.${e.source_column}`);
              const tgtCol = layout.anchors.get(`L:${e.target_table}.${e.target_column}`);
              const tgtColR = layout.anchors.get(`R:${e.target_table}.${e.target_column}`);
              if (!srcCol || !tgtCol) return null;
              const dim = !edgeActive(e);
              const hot = hovered !== null && edgeActive(e);

              let from = srcCol;
              let to = tgtCol;
              if (tgtCol.x < srcCol.x && srcColL && tgtColR) {
                // Target is to the left: leave left, arrive right.
                from = srcColL;
                to = tgtColR;
              }

              // Same column (cards stacked vertically): bow out to the right so
              // the line never runs straight through the card it starts from.
              const sameColumn = Math.abs(to.x - from.x) < 8;
              const d = sameColumn
                ? `M ${from.x} ${from.y} C ${from.x + 46} ${from.y}, ${to.x + 46} ${to.y}, ${to.x} ${to.y}`
                : `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`;

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
      </div>
    </div>
  );
}

function clampWidth(w: number, layoutWidth: number): number {
  return Math.min(layoutWidth, Math.max(layoutWidth / MAX_ZOOM, +w.toFixed(2)));
}

const MAX_ZOOM = 2.6;

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

interface LaidOutLane {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Layout {
  nodes: LaidOutNode[];
  lanes: LaidOutLane[];
  anchors: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

const ROW = 24;
const HEADER = 32;
const NODE_W = 232;
const NODE_GAP = 26;
const ROW_GAP = 18;
const LANE_PAD_TOP = 40;
const LANE_PAD_BOTTOM = 16;
const LANE_GAP = 18;
const LANE_LABEL_W = 116;
const PAD = 24;
const PER_ROW = 4;

/**
 * Which lane a table belongs to.
 *
 * This is a hint, not a whitelist: a table the map does not mention lands in
 * "Other" rather than disappearing, so a new table still shows up the moment a
 * migration creates it.
 */
const DOMAIN: Record<string, string> = {
  users: "Identity",
  profiles: "Identity",
  activity: "Identity",
  oauth_accounts: "Identity",
  follows: "Identity",
  connections: "Identity",
  messages: "Identity",
  skill_categories: "Skills",
  skills: "Skills",
  user_skills: "Skills",
  endorsements: "Skills",
  skill_assessments: "Skills",
  projects: "Projects",
  project_skills: "Projects",
  applications: "Projects",
  memberships: "Projects",
  project_updates: "Projects",
  tasks: "Projects",
  project_comments: "Projects",
  ratings: "Projects",
  reports: "Projects",
  transactions: "Projects",
};

const LANE_ORDER = ["Identity", "Skills", "Projects", "Other"];

/**
 * Lay the graph out as horizontal domain lanes.
 *
 * Tables keep their domain's lane; within a lane they wrap every PER_ROW
 * cards so the drawing stays a readable width. Lane heights are computed from
 * their tallest row, so cards never collide and nothing runs off the bottom.
 */
function layoutGraph(graph: Graph): Layout {
  const byLane = new Map<string, SchemaNode[]>();
  for (const n of graph.nodes) {
    const lane = DOMAIN[n.name] ?? "Other";
    const list = byLane.get(lane) ?? [];
    list.push(n);
    byLane.set(lane, list);
  }

  // Stable order inside a lane so the picture does not reshuffle run to run.
  for (const list of byLane.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const nodes: LaidOutNode[] = [];
  const lanes: LaidOutLane[] = [];
  const anchors = new Map<string, { x: number; y: number }>();

  const cardH = (n: SchemaNode) => HEADER + n.columns.length * ROW + 6;
  const contentW = PER_ROW * NODE_W + (PER_ROW - 1) * NODE_GAP;
  const laneX = PAD + LANE_LABEL_W;
  let y = PAD;
  let maxX = laneX + contentW;

  for (const label of LANE_ORDER) {
    const list = byLane.get(label);
    if (!list || list.length === 0) continue;

    // Split into rows, and size each row to its tallest card.
    const rows: SchemaNode[][] = [];
    for (let i = 0; i < list.length; i += PER_ROW) rows.push(list.slice(i, i + PER_ROW));
    const rowHeights = rows.map((r) => Math.max(...r.map(cardH)));
    const inner = rowHeights.reduce((sum, h) => sum + h, 0) + (rows.length - 1) * ROW_GAP;
    const laneH = LANE_PAD_TOP + inner + LANE_PAD_BOTTOM;

    lanes.push({ label, x: PAD, y, width: contentW + LANE_LABEL_W + 12, height: laneH });

    let ry = y + LANE_PAD_TOP;
    rows.forEach((row, ri) => {
      // Centre each row's cards inside the lane width.
      const used = row.length * NODE_W + (row.length - 1) * NODE_GAP;
      let rx = laneX + Math.max(0, (contentW - used) / 2);
      for (const n of row) {
        nodes.push({ name: n.name, rows: n.rows, columns: n.columns, x: rx, y: ry, width: NODE_W });
        n.columns.forEach((c, i) => {
          const cy = ry + HEADER + i * ROW + ROW / 2;
          anchors.set(`R:${n.name}.${c.name}`, { x: rx + NODE_W, y: cy });
          anchors.set(`L:${n.name}.${c.name}`, { x: rx, y: cy });
        });
        rx += NODE_W + NODE_GAP;
      }
      ry += rowHeights[ri] + ROW_GAP;
    });

    maxX = Math.max(maxX, laneX + contentW);
    y += laneH + LANE_GAP;
  }

  return {
    nodes,
    lanes,
    anchors,
    width: maxX + PAD,
    height: Math.max(y - LANE_GAP + PAD, 400),
  };
}

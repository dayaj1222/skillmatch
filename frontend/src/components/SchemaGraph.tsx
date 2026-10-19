import { useMemo, useState } from "react";

import type { SchemaEdge, SchemaGraph as Graph, SchemaNode } from "../lib/types";

/**
 * The relational graph, drawn as horizontal domain lanes.
 *
 * Three cards per row, every row centred on the same axis, and the whole
 * drawing scaled to the frame width rather than cropped — nothing is ever
 * pushed off-screen. The domain map is a hint, not a whitelist: a table it
 * does not mention lands in an "Other" lane, so a table added by a migration
 * still appears. Hover a table to isolate its relationships.
 */
export function SchemaGraph({ graph }: { graph: Graph }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const layout = useMemo(() => layoutGraph(graph), [graph]);

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
    <div className="rounded-md border border-rule">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <span className="text-[0.875rem] font-semibold">Relational graph</span>
        <span className="tnum text-[0.8125rem] text-faint">
          {graph.nodes.length} tables / {graph.edges.length} relationships
        </span>
      </div>

      <div className="bg-paper px-3 py-4">
        <svg
          className="block w-full"
          viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
          style={{ height: "auto" }}
        >
          <defs>
            <marker id="fk-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" className="fill-ink" opacity="0.5" />
            </marker>
            <marker id="fk-arrow-hot" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" className="fill-signal" />
            </marker>
          </defs>

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
                y={lane.y + 22}
                className="fill-muted"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8 }}
              >
                {lane.label.toUpperCase()}
              </text>
            </g>
          ))}

          {graph.edges.map((e, i) => {
            const from = layout.anchors.get(`R:${e.source_table}.${e.source_column}`);
            const to = layout.anchors.get(`L:${e.target_table}.${e.target_column}`);
            if (!from || !to) return null;
            const hot = hovered !== null && edgeActive(e);
            const dim = !edgeActive(e);
            const midX = (from.x + to.x) / 2;
            return (
              <path
                key={`${e.name}-${i}`}
                d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                fill="none"
                className={hot ? "stroke-signal" : "stroke-ink"}
                strokeWidth={hot ? 2 : 1.25}
                opacity={dim ? 0.08 : hot ? 0.95 : 0.4}
                markerEnd={hot ? "url(#fk-arrow-hot)" : "url(#fk-arrow)"}
              />
            );
          })}

          {layout.nodes.map((n) => (
            <TableBox
              key={n.name}
              box={n}
              dim={neighbours !== null && !neighbours.has(n.name)}
              active={hovered === n.name}
              onEnter={() => setHovered(n.name)}
              onLeave={() => setHovered(null)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
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
  const height = HEADER + box.columns.length * ROW + 6;

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
        strokeWidth={active ? 2.5 : 1.2}
      />
      <rect width={box.width} height={HEADER} className="fill-surface" />
      <rect y={HEADER} width={box.width} height={1} className="fill-rule" />
      <text x={12} y={20} className="fill-ink" style={{ fontSize: 12.5, fontWeight: 600 }}>
        {box.name}
      </text>
      <text
        x={box.width - 12}
        y={20}
        textAnchor="end"
        className="fill-muted"
        style={{ fontSize: 11, opacity: 0.7 }}
      >
        {box.rows}
      </text>

      {box.columns.map((c, i) => {
        const y = HEADER + 15 + i * ROW;
        return (
          <g key={c.name}>
            {c.is_primary_key && (
              <text x={12} y={y} className="fill-signal" style={{ fontSize: 10, fontWeight: 700 }}>
                PK
              </text>
            )}
            {!c.is_primary_key && c.is_foreign_key && (
              <text
                x={12}
                y={y}
                className="fill-ink"
                style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}
              >
                FK
              </text>
            )}
            <text x={38} y={y} className="fill-ink font-mono" style={{ fontSize: 11.5 }}>
              {c.name}
            </text>
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
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const ROW = 21;
const HEADER = 30;
const CARD_W = 232;
const PER_ROW = 3;
const CARD_GAP = 26;
const LANE_W = 1120;
const LABEL_W = 126;
const LANE_TOP = 36;
const LANE_BOTTOM = 18;
const LANE_GAP = 14;
const ROW_GAP = 16;
const TOP = 18;
const PAD = 24;

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

const cardHeight = (n: SchemaNode) => HEADER + n.columns.length * ROW + 6;

/** Three cards per row, each lane sized to its tallest row. */
function layoutGraph(graph: Graph): Layout {
  const byLane = new Map<string, SchemaNode[]>();
  for (const n of graph.nodes) {
    const lane = DOMAIN[n.name] ?? "Other";
    const list = byLane.get(lane) ?? [];
    list.push(n);
    byLane.set(lane, list);
  }
  for (const list of byLane.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const nodes: LaidOutNode[] = [];
  const lanes: LaidOutLane[] = [];
  const anchors = new Map<string, { x: number; y: number }>();

  const laneX = PAD;
  const contentX = laneX + LABEL_W;
  let y = TOP;

  for (const label of LANE_ORDER) {
    const list = byLane.get(label);
    if (!list || list.length === 0) continue;

    const rows: SchemaNode[][] = [];
    for (let i = 0; i < list.length; i += PER_ROW) rows.push(list.slice(i, i + PER_ROW));
    const rowHeights = rows.map((r) => Math.max(...r.map(cardHeight)));
    let inner = 0;
    for (const h of rowHeights) inner += h + ROW_GAP;
    inner -= ROW_GAP;

    const laneH = LANE_TOP + inner + LANE_BOTTOM;
    lanes.push({ label, x: laneX, y, width: LANE_W, height: laneH });

    let ry = y + LANE_TOP;
    rows.forEach((row, ri) => {
      const used = row.length * CARD_W + (row.length - 1) * CARD_GAP;
      const laneInner = LANE_W - LABEL_W;
      let rx = contentX + Math.max(0, (laneInner - used) / 2);
      for (const n of row) {
        nodes.push({
          name: n.name,
          rows: n.rows,
          columns: n.columns,
          x: rx,
          y: ry,
          width: CARD_W,
        });
        n.columns.forEach((c, i) => {
          const cy = ry + HEADER + 15 + i * ROW - 4;
          anchors.set(`R:${n.name}.${c.name}`, { x: rx + CARD_W, y: cy });
          anchors.set(`L:${n.name}.${c.name}`, { x: rx, y: cy });
        });
        rx += CARD_W + CARD_GAP;
      }
      ry += rowHeights[ri] + ROW_GAP;
    });

    y += laneH + LANE_GAP;
  }

  return {
    nodes,
    lanes,
    anchors,
    minX: laneX,
    minY: TOP,
    width: LANE_W,
    height: Math.max(y - LANE_GAP - TOP, 200),
  };
}

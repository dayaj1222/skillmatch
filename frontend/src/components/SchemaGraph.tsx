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

          {layout.columns.map((col) => (
            <text
              key={col.label}
              x={col.x}
              y={col.y + 16}
              className="fill-muted"
              style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8 }}
            >
              {col.label}
            </text>
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

interface LaidOutColumn {
  label: string;
  x: number;
  y: number;
}

interface Layout {
  nodes: LaidOutNode[];
  columns: LaidOutColumn[];
  anchors: Map<string, { x: number; y: number }>;
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const ROW = 21;
const HEADER = 30;
const CARD_W = 232;
const PER_COLUMN = 5;
const COL_GAP = 26;
const COLUMN_GAP = 60;
const HEADING_H = 30;
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

const COLUMN_LABEL: Record<string, string> = {
  Identity: "IDENTITY",
  Skills: "SKILLS",
  Projects: "PROJECTS",
  Other: "OTHER",
};

const cardHeight = (n: SchemaNode) => HEADER + n.columns.length * ROW + 6;

/**
 * One vertical column per domain, five cards deep. A domain with more than
 * five tables continues in a numbered column beside it, exactly as the design
 * study does. Nothing is scaled or cropped: the page scrolls instead.
 */
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
  const columns: LaidOutColumn[] = [];
  const anchors = new Map<string, { x: number; y: number }>();

  let x = PAD;
  let maxRight = PAD;
  let maxBottom = TOP + HEADING_H;

  for (const label of LANE_ORDER) {
    const list = byLane.get(label);
    if (!list || list.length === 0) continue;

    const parts = Math.ceil(list.length / PER_COLUMN);
    for (let part = 0; part < parts; part++) {
      const chunk = list.slice(part * PER_COLUMN, (part + 1) * PER_COLUMN);
      const heading = parts > 1 ? `${COLUMN_LABEL[label]} ${part + 1}` : COLUMN_LABEL[label];

      let y = TOP + HEADING_H;
      for (const n of chunk) {
        nodes.push({ name: n.name, rows: n.rows, columns: n.columns, x, y, width: CARD_W });
        n.columns.forEach((c, i) => {
          const cy = y + HEADER + 15 + i * ROW - 4;
          anchors.set(`R:${n.name}.${c.name}`, { x: x + CARD_W, y: cy });
          anchors.set(`L:${n.name}.${c.name}`, { x, y: cy });
        });
        y += cardHeight(n) + COL_GAP;
      }

      columns.push({ label: heading, x, y: TOP });
      maxRight = Math.max(maxRight, x + CARD_W);
      maxBottom = Math.max(maxBottom, y - COL_GAP);
      x += CARD_W + COLUMN_GAP;
    }
  }

  return {
    nodes,
    columns,
    anchors,
    minX: PAD,
    minY: TOP,
    width: maxRight - PAD,
    height: maxBottom - TOP,
  };
}

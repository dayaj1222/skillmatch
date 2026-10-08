import { useEffect, useMemo, useState } from "react";

import { SchemaGraph } from "../components/SchemaGraph";
import { ErrorNote, SectionHead, SkeletonRows } from "../components/ui";
import { api } from "../lib/api";
import type { SchemaOverview } from "../lib/types";

/**
 * The schema lab: the database, live.
 *
 * This is the point of the project. The page reads the *actual* Postgres
 * catalog — row counts, constraint definitions from pg_constraint, installed
 * triggers — so it cannot drift from the real schema. Nothing here is
 * hardcoded; if a constraint is missing, the page shows it missing.
 */
export function SchemaPage() {
  const [schema, setSchema] = useState<SchemaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .schema()
      .then(setSchema)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the schema"))
      .finally(() => setLoading(false));
  }, []);

  const constraintsByTable = useMemo(() => {
    const map = new Map<string, SchemaOverview["constraints"]>();
    for (const c of schema?.constraints ?? []) {
      const list = map.get(c.table) ?? [];
      list.push(c);
      map.set(c.table, list);
    }
    return map;
  }, [schema]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1500px]">
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (error || !schema) {
    return (
      <div className="mx-auto max-w-[1500px]">
        <ErrorNote message={error ?? "Schema unavailable"} />
      </div>
    );
  }

  const totalRows = schema.tables.reduce((sum, t) => sum + t.rows, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-10">
      <div>
        <h1 className="display text-[clamp(1.75rem,4vw,2.5rem)]">The schema, live</h1>
        <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-relaxed text-muted">
          Read straight from the Postgres catalog. Every rule the database enforces is listed
          here with its real definition — constraints and triggers included, not summarised.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-4">
        <Stat label="Tables" value={schema.tables.length} />
        <Stat label="Rows" value={totalRows} />
        <Stat label="Indexes" value={schema.indexes} />
        <Stat label="Foreign keys" value={schema.fk_count} />
      </div>

      <div>
        <SectionHead title="Relationships" meta="hover to isolate / from pg_constraint" />
        <SchemaGraph graph={schema.graph} />
      </div>

      <div>
        <SectionHead title="Tables" meta="live row counts" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-3 md:grid-cols-4">
          {schema.tables.map((t) => (
            <div key={t.name} className="bg-paper p-3.5">
              <p className="truncate text-[0.9375rem] font-medium" title={t.name}>
                {t.name}
              </p>
              <p className="tnum mt-1 text-[0.8125rem] text-muted">
                {t.rows} {t.rows === 1 ? "row" : "rows"}
              </p>
              <RowBar rows={t.rows} max={maxRows(schema.tables)} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHead
          title="Invariants"
          meta={`${schema.constraints.length} constraints / pg_constraint`}
        />
        <div className="space-y-6">
          {[...constraintsByTable.entries()].map(([table, list]) => (
            <div key={table}>
              <p className="mb-2 text-[0.8125rem] font-semibold text-ink">
                {table}
              </p>
              <ul className="register rounded-md border border-rule">
                {list.map((c) => (
                  <li
                    key={c.name}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
                  >
                    <span className="chip shrink-0 text-muted">{c.kind}</span>
                    <span className="font-mono text-[0.8125rem]">{c.name}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-faint" title={c.definition}>
                      {c.definition}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHead
          title="Triggers"
          meta={`${schema.triggers.length} installed / pg_trigger`}
        />
        <ul className="register rounded-md border border-rule">
          {schema.triggers.map((t) => (
            <li
              key={`${t.table}.${t.name}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className="chip text-muted">{t.timing}</span>
              <span className="chip text-muted">{t.event}</span>
              <span className="font-mono text-[0.8125rem]">{t.name}</span>
              <span className="tnum ml-auto text-[0.8125rem] text-faint">
                on {t.table}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="border-t border-rule pt-4 text-[0.8125rem] text-faint">
        Every rule that can be a constraint <em>is</em> a constraint. The triggers cover the two
        rules a CHECK cannot express.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper p-4">
      <p className="tnum display text-[2rem] leading-none">{value}</p>
      <p className="tnum mt-1.5 text-[0.8125rem] text-muted">
        {label}
      </p>
    </div>
  );
}

function maxRows(tables: { rows: number }[]): number {
  return Math.max(1, ...tables.map((t) => t.rows));
}

/** A thin bar so row counts are comparable at a glance, not just read. */
function RowBar({ rows, max }: { rows: number; max: number }) {
  const pct = Math.round((rows / max) * 100);
  return (
    <div className="mt-2.5 h-1.5 w-full bg-rule/15" role="presentation">
      <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
    </div>
  );
}

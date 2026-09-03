/**
 * Runway — datastore head-to-head scaling lens. Pure & framework-free.
 *
 * Composes the existing engine (`resolve` + `computeDatastore`) and the CAPACITY
 * metadata to expose, per datastore (Postgres / Cassandra / MongoDB):
 *  - the per-node throughput / cost / RF facts (DbFacts), and
 *  - how node count + cost scale as load grows (DbScaleCurve),
 *  - including the Postgres single-primary write wall (writeCeilingRps).
 *
 * It does NOT reimplement the node-count formula — it calls computeDatastore()
 * directly so this view can never drift from `computeStack`'s datastore tier.
 * There is no cache in this view: datastores are compared head-to-head, so
 * dbReads === reads (every read hits the store).
 */
import type { Db, Provider } from "./types.ts";
import { DB_KEY, resolve } from "./constants.ts";
import { sanitizeOverrides } from "./sanitize.ts";
import { computeDatastore } from "./components/datastore.ts";

/** Per-datastore facts derived from CAPACITY + provider/managed economics. */
export interface DbFacts {
  db: Db;
  label: string;
  readPerNode: number;
  writePerNode: number;
  costPerNode: number;
  rf: number;
  readLatencyMs: number;
  writeScales: boolean;
  /**
   * Total rps at which writes exceed a single primary (given readFrac), for a
   * single-primary store; `null` when writes scale out horizontally.
   *   writeCeilingRps = writePerNode / (1 - readFrac)
   */
  writeCeilingRps: number | null;
  /** Transaction model: strong/transactional (ACID) vs eventually-consistent (BASE). */
  consistency: "ACID" | "BASE";
  /** CAP class under a network partition: CP (consistency) or AP (availability). */
  cap: "CP" | "AP" | "CA";
  /** Short rationale for the consistency/CAP classification. */
  capNote: string;
}

/** One sampled point on a datastore's scaling curve. */
export interface DbScalePoint {
  rps: number;
  reads: number;
  writes: number;
  nodes: number;
  cost: number;
  util: number;
  writeCeiling: boolean;
}

/** A datastore's full scaling curve across the swept load range. */
export interface DbScaleCurve {
  db: Db;
  label: string;
  facts: DbFacts;
  points: DbScalePoint[];
}

/** Options for the datastore scaling sweep. */
export interface DatastoreScalingOptions {
  maxRps: number;
  steps?: number;
  readFrac?: number;
  provider?: Provider;
  managed?: boolean;
  overrides?: Record<string, number>;
}

/** All datastores, in display order: single-primary engines first, then scale-out. */
const DBS: Db[] = [
  "postgres",
  "mysql",
  "aurora",
  "oracledb",
  "cassandra",
  "mongodb",
];

const LABELS: Record<Db, string> = {
  postgres: "Postgres",
  mysql: "MySQL",
  aurora: "Aurora",
  oracledb: "Oracle",
  cassandra: "Cassandra",
  mongodb: "MongoDB",
};

/**
 * writeScales is a property of the DB engine (mirrors stack.ts:
 * `dbKey === "cass" || dbKey === "mongo"`), not a CAPACITY leaf. Postgres,
 * MySQL, Aurora and Oracle pin writes to a single primary/writer; only the
 * scale-out stores (Cassandra, MongoDB) add write capacity by adding nodes.
 */
const WRITE_SCALES: Record<Db, boolean> = {
  postgres: false,
  mysql: false,
  aurora: false,
  oracledb: false,
  cassandra: true,
  mongodb: true,
};

/**
 * Categorical consistency / CAP-theorem classification per engine.
 *
 * Source: the CAP theorem (E. Brewer, PODC 2000 keynote; formalized by Gilbert
 * & Lynch, 2002) — under a network partition a distributed store can guarantee
 * at most two of Consistency, Availability, Partition-tolerance, so real systems
 * choose CP (consistency over availability) or AP (availability over
 * consistency). The ACID-vs-BASE framing (Pritchett, 2008) contrasts the strong,
 * transactional guarantees of single-primary relational engines (ACID) with the
 * Basically-Available, Soft-state, Eventually-consistent posture of scale-out
 * NoSQL stores (BASE).
 *
 * - Single-primary relational engines (Postgres, MySQL/InnoDB, Aurora single
 *   writer, Oracle) are ACID + CP: they favor consistency and give up
 *   availability of the primary under a partition.
 * - Cassandra is BASE + AP: tunable consistency whose defaults favor
 *   availability and eventual consistency under a partition.
 * - MongoDB is BASE + CP: a replica set elects a primary and favors consistency
 *   under a partition; it has supported multi-document ACID transactions since
 *   4.0, but its default architecture remains BASE/eventually-consistent.
 */
const DB_TRAITS: Record<
  Db,
  { consistency: "ACID" | "BASE"; cap: "CP" | "AP" | "CA"; capNote: string }
> = {
  postgres: {
    consistency: "ACID",
    cap: "CP",
    capNote: "Single primary; favors consistency, gives up availability under partition.",
  },
  mysql: {
    consistency: "ACID",
    cap: "CP",
    capNote: "Single-primary InnoDB; strong consistency over availability under partition.",
  },
  aurora: {
    consistency: "ACID",
    cap: "CP",
    capNote: "Single writer; strongly consistent reads from the writer.",
  },
  oracledb: {
    consistency: "ACID",
    cap: "CP",
    capNote: "Single primary; strong consistency over availability under partition.",
  },
  cassandra: {
    consistency: "BASE",
    cap: "AP",
    capNote: "Tunable consistency; defaults favor availability + eventual consistency.",
  },
  mongodb: {
    consistency: "BASE",
    cap: "CP",
    capNote: "Replica set favors consistency; multi-document ACID transactions since 4.0.",
  },
};

/** Clamp a finite number into [min, max]; non-finite -> fallback. */
function guard(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}

interface FactsOpts {
  readFrac?: number;
  provider?: Provider;
  managed?: boolean;
  overrides?: Record<string, number>;
}

/**
 * Compute the DB cost multiplier the SAME way stack.ts does (lines 54-61), for
 * the standalone (no growth/inputs) case: reserved is never applied here, so
 *   dmult = managedMult * (1 * storage).
 * Default provider=aws, managed=false -> storage=1, managedMult=1 -> dmult=1.
 */
function dmultFor(
  g: (path: string) => number,
  provider: Provider,
  managed: boolean,
): number {
  const storage = g(`PRICE.${provider}.storage`);
  const reservedMult = 1; // reserved not modelled in this lens
  const managedMult = managed ? g("managed_mult") : 1;
  const smult = reservedMult * storage;
  return managedMult * smult;
}

/**
 * Facts for all three datastores. Reads CAPACITY through `resolve` so overrides
 * apply; `writeCeilingRps` is the total-rps wall for single-primary writes.
 */
export function datastoreFacts(opts: FactsOpts = {}): DbFacts[] {
  const readFrac = guard(opts.readFrac ?? 0.9, 0.5, 1, 0.9);
  const provider: Provider = opts.provider ?? "aws";
  const managed = opts.managed ?? false;
  const overrides = opts.overrides ? sanitizeOverrides(opts.overrides) : undefined;
  const g = resolve(overrides);
  // $/node reflects the SAME provider/managed economics as the scaling cost
  // curve (dmult), so the facts card reconciles with the cost chart.
  const dmult = dmultFor(g, provider, managed);

  return DBS.map((db) => {
    const key = DB_KEY[db];
    const readPerNode = g(`${key}.read`);
    const writePerNode = g(`${key}.write`);
    const costPerNode = g(`${key}.cost`) * dmult;
    const rf = g(`${key}.rf`);
    const readLatencyMs = g(`lat_db.${db}`);
    const writeScales = WRITE_SCALES[db];
    const writeCeilingRps = writeScales ? null : writePerNode / (1 - readFrac);
    const traits = DB_TRAITS[db];
    return {
      db,
      label: LABELS[db],
      readPerNode,
      writePerNode,
      costPerNode,
      rf,
      readLatencyMs,
      writeScales,
      writeCeilingRps,
      consistency: traits.consistency,
      cap: traits.cap,
      capNote: traits.capNote,
    };
  });
}

/**
 * Sweep load from a sensible floor to `maxRps` over `steps` points and, for
 * each datastore, compute node count / cost / util via `computeDatastore` (no
 * cache: dbReads === reads). Returns one curve per datastore.
 */
export function datastoreScaling(opts: DatastoreScalingOptions): DbScaleCurve[] {
  const maxRps = guard(opts.maxRps, 1, Number.MAX_SAFE_INTEGER, 1);
  const steps = Math.max(2, Math.floor(guard(opts.steps ?? 48, 2, 10000, 48)));
  const readFrac = guard(opts.readFrac ?? 0.9, 0.5, 1, 0.9);
  const provider: Provider = opts.provider ?? "aws";
  const managed = opts.managed ?? false;
  const overrides = opts.overrides ? sanitizeOverrides(opts.overrides) : undefined;

  const g = resolve(overrides);
  const dmult = dmultFor(g, provider, managed);
  const facts = datastoreFacts({
    ...(opts.readFrac !== undefined ? { readFrac } : {}),
    provider,
    managed,
    ...(opts.overrides ? { overrides: opts.overrides } : {}),
  });
  const factsByDb = new Map<Db, DbFacts>(facts.map((f) => [f.db, f]));

  // Floor: at least 1 rps; sweep linearly to maxRps (inclusive at both ends).
  const floor = Math.min(1, maxRps);

  return DBS.map((db) => {
    const writeScales = WRITE_SCALES[db];
    const points: DbScalePoint[] = [];
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      const rps = floor + (maxRps - floor) * t;
      const reads = rps * readFrac;
      const writes = rps * (1 - readFrac);
      const r = computeDatastore(g, db, reads, writes, dmult, writeScales);
      points.push({
        rps,
        reads,
        writes,
        nodes: r.nodes,
        cost: r.cost,
        util: r.util,
        writeCeiling: r.writeCeiling,
      });
    }
    const f = factsByDb.get(db);
    return {
      db,
      label: LABELS[db],
      facts: f ?? datastoreFacts()[DBS.indexOf(db)]!,
      points,
    };
  });
}

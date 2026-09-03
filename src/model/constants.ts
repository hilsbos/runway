/**
 * Runway — constants & multi-cloud price tables.
 *
 * Every numeric is a `Constant<number>` { value, unit, source, editable? } so
 * the UI can generate an Assumptions/Sources panel from metadata (never hand
 * written) and let the user tune any value. The engine reads `.value` via the
 * flattening helpers below; tests/UI override single values by dotted path.
 *
 * Default values are the VERIFIED Appendix A constants with the Appendix B
 * source strings (MODEL-SPEC.md). GCP/Azure/on-prem price entries are sourced
 * best-effort estimates per §4.
 */

import type { Constant, Provider, ProviderPrice } from "./types.ts";

/* helper to keep declarations terse */
const C = (
  value: number,
  unit = "",
  source = "",
  editable?: [number, number],
): Constant => (editable ? { value, unit, source, editable } : { value, unit, source });

/* -------------------------------------------------------------------------- */
/* CAPACITY (§A.1)                                                            */
/* -------------------------------------------------------------------------- */

const APP_BENCH = "TechEmpower Round 23 (Actix/Spring), Appx B";
const NODE_COST_SRC = "EC2 Graviton c7g/r7g basis, Appx B";

export const CAPACITY = {
  // API throughput, req/s per vCPU core (node tput = perCore × cores)
  core_rust_rest: C(11250, "rps/vCPU", APP_BENCH, [2000, 20000]),
  core_rust_grpc: C(15000, "rps/vCPU", APP_BENCH, [2000, 25000]),
  core_java_rest: C(4375, "rps/vCPU", APP_BENCH, [1000, 12000]),
  core_java_grpc: C(7500, "rps/vCPU", APP_BENCH, [1000, 15000]),

  // API node cost components, USD/mo (nodeCost = vCPU×vcpu + GB×gb)
  api_cost_vcpu: C(22, "USD/mo", NODE_COST_SRC, [10, 40]),
  api_cost_gb: C(2.1, "USD/mo", NODE_COST_SRC, [1, 6]),

  // API node memory model, MB
  mem_base_rust: C(64, "MB", "native runtime baseline est.", [16, 256]),
  mem_base_java: C(700, "MB", "JVM runtime baseline est.", [256, 2048]),
  mem_conn_rust: C(0.03, "MB/req", "per in-flight request est.", [0.005, 0.2]),
  mem_conn_java: C(0.4, "MB/req", "per in-flight request est.", [0.05, 1.5]),
  local_cache_mb: C(2048, "MB", "local cache allocation per node", [256, 8192]),

  // capacity planning
  target_util: C(0.7, "", "capacity headroom convention", [0.5, 0.9]),

  // load balancer
  haproxy_tput: C(200000, "rps/node", "HAProxy 1M+/8-core derated, Appx B", [50000, 500000]),
  haproxy_cost: C(106, "USD/mo", "c7g.xlarge basis, Appx B", [50, 300]),

  // datastores: read/node, write/node (ops/s), node cost USD/mo, replication factor
  cass: {
    read: C(50000, "ops/s", "YCSB Cassandra i4i NVMe, Appx B", [10000, 150000]),
    write: C(50000, "ops/s", "YCSB Cassandra LSM scale-out, Appx B", [10000, 150000]),
    cost: C(650, "USD/mo", "i4i.2xlarge basis, Appx B", [200, 1500]),
    rf: C(3, "", "replication factor", [1, 5]),
    writeScales: true,
  },
  mongo: {
    read: C(50000, "ops/s", "YCSB MongoDB r7g, Appx B", [10000, 150000]),
    write: C(25000, "ops/s", "YCSB MongoDB r7g, Appx B", [5000, 100000]),
    cost: C(550, "USD/mo", "r7g.2xlarge basis, Appx B", [200, 1500]),
    rf: C(3, "", "replication factor", [1, 5]),
    writeScales: true,
  },
  pg: {
    read: C(25000, "ops/s", "YCSB Postgres replica reads, Appx B", [5000, 100000]),
    write: C(12000, "ops/s", "Postgres single-primary writes, Appx B", [2000, 100000]),
    cost: C(600, "USD/mo", "r7g.2xlarge basis, Appx B", [200, 1500]),
    rf: C(3, "", "replication factor", [1, 5]),
    writeScales: false,
  },
  // MySQL/InnoDB: single-primary writes like Postgres; reads scale via replicas.
  mysql: {
    read: C(28000, "ops/s", "sysbench MySQL 8 InnoDB OLTP point reads, Appx B", [5000, 100000]),
    write: C(14000, "ops/s", "MySQL 8 InnoDB single-primary writes, Appx B", [2000, 100000]),
    cost: C(600, "USD/mo", "RDS db.r7g.2xlarge basis ($0.956/hr), Appx B", [200, 1500]),
    rf: C(3, "", "replication factor (primary + replicas)", [1, 5]),
    writeScales: false,
  },
  // Amazon Aurora (MySQL-compatible): distributed log-structured storage lifts
  // read/write throughput, but writes still go to a SINGLE writer instance
  // (read replicas don't add write capacity) -> single-primary write wall.
  aurora: {
    read: C(60000, "ops/s", "Aurora distributed storage + read-replica scale, Appx B", [10000, 150000]),
    write: C(30000, "ops/s", "Aurora single-writer, log-structured storage, Appx B", [5000, 100000]),
    cost: C(1100, "USD/mo", "Aurora db.r7g.2xlarge I/O-Optimized + storage basis, Appx B", [400, 3000]),
    rf: C(3, "", "compute replicas (1 writer + readers); storage is 6-way", [1, 5]),
    writeScales: false,
  },
  // Oracle Database EE: strong single-primary engine; cost dominated by
  // licensing (EE list $47,500/processor) -> high amortized per-node cost.
  oracle: {
    read: C(35000, "ops/s", "Oracle DB EE OLTP read est., Appx B", [5000, 120000]),
    write: C(18000, "ops/s", "Oracle DB EE single-primary writes est., Appx B", [2000, 100000]),
    cost: C(3000, "USD/mo", "RDS Oracle EE License-Included db.r7g.2xlarge / amortized EE license, Appx B", [600, 9000]),
    rf: C(3, "", "replication factor (Data Guard standbys)", [1, 5]),
    writeScales: false,
  },

  // distributed cache (Redis-class)
  redis_tput: C(150000, "ops/s", "Redis GET/SET w/ IO-threads, Appx B", [50000, 500000]),
  redis_cost: C(320, "USD/mo", "cache.r7g basis, Appx B", [100, 1000]),
  redis_rf: C(2, "", "replication factor", [1, 5]),

  // multipliers
  local_hit_penalty: C(0.85, "", "local cache no cross-node sharing", [0.5, 1]),
  managed_mult: C(1.6, "x", "Atlas/Astra/Aurora premium", [1.2, 2.5]),
  reserved_mult: C(0.62, "x", "1–3yr reserved/savings plans", [0.4, 1]),

  // latency, ms
  lat_haproxy: C(0.2, "ms", "HAProxy hop est.", [0, 2]),
  lat_api_rust: C(0.4, "ms", "native app handler est.", [0.05, 3]),
  lat_api_java: C(0.9, "ms", "JVM app handler est.", [0.1, 5]),
  lat_grpc_factor: C(0.85, "x", "gRPC vs REST factor", [0.5, 1]),
  lat_local_hit: C(0.2, "ms", "local cache hit est.", [0, 2]),
  lat_dist_hit: C(0.8, "ms", "distributed cache hit est.", [0, 3]),
  lat_db: {
    cassandra: C(3, "ms", "Cassandra read est.", [0.5, 20]),
    mongodb: C(4, "ms", "MongoDB read est.", [0.5, 20]),
    postgres: C(2.5, "ms", "Postgres read est.", [0.5, 20]),
    mysql: C(2.5, "ms", "MySQL read est.", [0.5, 20]),
    aurora: C(2, "ms", "Aurora read est. (reader endpoint)", [0.5, 20]),
    oracledb: C(3, "ms", "Oracle DB read est.", [0.5, 20]),
  },

  // egress
  payload_kb: C(1, "KB", "avg response payload est.", [0.1, 100]),
  egress_per_gb: C(0.09, "USD/GB", "AWS internet egress, Appx B", [0, 0.3]),
  SEC_PER_MONTH: C(2592000, "s/mo", "30d month"),
} as const;

/* db key map */
export const DB_KEY = {
  cassandra: "cass",
  mongodb: "mongo",
  postgres: "pg",
  mysql: "mysql",
  aurora: "aurora",
  oracledb: "oracle",
} as const;

/* -------------------------------------------------------------------------- */
/* AUTHZ (§A.2 + 2 new latency constants)                                      */
/* -------------------------------------------------------------------------- */

export const AUTHZ = {
  core_rust: C(11250, "rps/vCPU", APP_BENCH, [2000, 20000]),
  core_java: C(4375, "rps/vCPU", APP_BENCH, [1000, 12000]),
  node_vcpu: C(8, "vCPU", "standard compute node", [2, 64]),
  node_gb: C(16, "GB", "standard compute node", [4, 128]),
  sot_write_per_node: C(5000, "ops/s", "Cockroach/Yugabyte-class consensus, Appx B", [1000, 30000]),
  sot_cost: C(700, "USD/mo", "global consensus node basis, Appx B", [200, 2000]),
  sot_rf: C(3, "", "SoT replication factor", [3, 9]),
  tuple_bytes: C(200, "bytes", "ACL tuple size est.", [50, 1000]),
  push_lag_s: C(3, "s", "explicit-revocation propagation lag", [0, 30]),

  // NEW (redesign §6.2)
  lat_verify_local: C(0.15, "ms", "local in-process verify est.", [0, 1]),
  lat_verify_call: C(1.2, "ms", "per-request verify+policy lookup est.", [0, 5]),

  // NOTE: authz reuses CAPACITY.api_cost_vcpu/gb, target_util, SEC_PER_MONTH.
} as const;

/* -------------------------------------------------------------------------- */
/* ALG (§A.2)                                                                  */
/* -------------------------------------------------------------------------- */

const CRYPTO_SRC = "OpenSSL speed, Appx B";

export const ALG = {
  eddsa: { sign: C(30000, "sign/s", CRYPTO_SRC, [5000, 60000]), verify: C(11000, "verify/s", CRYPTO_SRC, [2000, 40000]), name: "EdDSA" },
  ecdsa: { sign: C(33000, "sign/s", CRYPTO_SRC, [5000, 60000]), verify: C(10500, "verify/s", CRYPTO_SRC, [2000, 40000]), name: "ECDSA P-256" },
  rsa: { sign: C(1500, "sign/s", CRYPTO_SRC, [500, 5000]), verify: C(33000, "verify/s", CRYPTO_SRC, [5000, 60000]), name: "RSA-2048" },
} as const;

/* -------------------------------------------------------------------------- */
/* PRICE — multi-cloud (§4). multipliers vs AWS basis; egress/xregion USD/GB   */
/* -------------------------------------------------------------------------- */

export const PRICE: Record<Provider, ProviderPrice> = {
  aws: {
    compute: C(1.0, "x", "AWS verified (Appx B)"),
    storage: C(1.0, "x", "AWS verified (Appx B)"),
    reserved: C(0.62, "x", "AWS 1–3yr reserved/savings (Appx B)", [0.4, 1]),
    egress: C(0.09, "USD/GB", "AWS internet egress (Appx B)", [0, 0.3]),
    xregion: C(0.02, "USD/GB", "AWS inter-region (Appx B)", [0, 0.1]),
    label: "AWS",
  },
  gcp: {
    compute: C(0.97, "x", "Compute Engine N2/T2A 2026 est.", [0.5, 1.5]),
    storage: C(1.05, "x", "GCP persistent disk 2026 est.", [0.5, 1.5]),
    reserved: C(0.55, "x", "GCP CUD 1–3yr 2026 est.", [0.4, 1]),
    egress: C(0.12, "USD/GB", "GCP tier-1 egress 2026", [0, 0.3]),
    xregion: C(0.01, "USD/GB", "GCP inter-region 2026 est.", [0, 0.1]),
    label: "GCP",
  },
  azure: {
    compute: C(1.04, "x", "Azure Dav5/Eav5 2026 est.", [0.5, 1.5]),
    storage: C(1.08, "x", "Azure managed disk 2026 est.", [0.5, 1.5]),
    reserved: C(0.6, "x", "Azure 1yr reserved 2026 est.", [0.4, 1]),
    egress: C(0.087, "USD/GB", "Azure bandwidth 2026", [0, 0.3]),
    xregion: C(0.02, "USD/GB", "Azure inter-region 2026 est.", [0, 0.1]),
    label: "Azure",
  },
  onprem: {
    compute: C(0.45, "x", "amortized commodity DC est.", [0.2, 1]),
    storage: C(0.5, "x", "amortized commodity DC est.", [0.2, 1]),
    reserved: C(1.0, "x", "no cloud reservation concept", [1, 1]),
    egress: C(0.01, "USD/GB", "internal DC egress est.", [0, 0.1]),
    xregion: C(0.005, "USD/GB", "internal DC inter-DC est.", [0, 0.05]),
    label: "On-prem",
  },
};

/* -------------------------------------------------------------------------- */
/* GROWTH defaults (§6.2)                                                      */
/* -------------------------------------------------------------------------- */

export const GROWTH_DEFAULTS = {
  ratePerYear: C(0.6, "fraction/yr", "typical SaaS preset (user input)", [0, 3]),
  horizonMonths: C(36, "months", "user input", [6, 60]),
};

/* -------------------------------------------------------------------------- */
/* flattening + override resolution                                           */
/* -------------------------------------------------------------------------- */

type AnyRec = Record<string, unknown>;

function isConstant(x: unknown): x is Constant {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as AnyRec).value === "number" &&
    typeof (x as AnyRec).unit === "string"
  );
}

/**
 * Flatten the constant trees into a dotted-path → number map of `.value`s.
 * Used to build the override-resolution table and the Assumptions panel rows.
 */
function flatten(
  node: AnyRec,
  prefix: string,
  out: Map<string, Constant>,
): void {
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (isConstant(child)) {
      out.set(prefix ? `${prefix}.${key}` : key, child);
    } else if (typeof child === "object" && child !== null) {
      flatten(child as AnyRec, prefix ? `${prefix}.${key}` : key, out);
    }
  }
}

/** Build the full dotted-path → Constant map across CAPACITY/AUTHZ/ALG/PRICE. */
export function constantMap(): Map<string, Constant> {
  const out = new Map<string, Constant>();
  flatten(CAPACITY as unknown as AnyRec, "", out);
  flatten(AUTHZ as unknown as AnyRec, "AUTHZ", out);
  flatten(ALG as unknown as AnyRec, "ALG", out);
  flatten(PRICE as unknown as AnyRec, "PRICE", out);
  flatten(GROWTH_DEFAULTS as unknown as AnyRec, "GROWTH", out);
  return out;
}

/**
 * Resolve a flat numeric config: every constant's `.value` keyed by dotted
 * path, with user `overrides` merged on top. The engine reads through this so
 * a single constant edits cleanly (e.g. {'pg.write':16000}).
 */
export function resolve(overrides?: Record<string, number>): (path: string) => number {
  const base = constantMap();
  return (path: string): number => {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, path)) {
      const v = overrides[path] as number;
      // Defensive: a non-finite override (NaN/±Inf) would poison every formula;
      // fall through to the base constant. In-range overrides are unaffected.
      if (Number.isFinite(v)) return v;
    }
    const c = base.get(path);
    if (c === undefined) {
      throw new Error(`Unknown constant path: ${path}`);
    }
    return c.value;
  };
}

/**
 * Generated rows for the Assumptions & Sources panel. Walks the constant trees
 * so the UI panel is never hand-written.
 */
export function listConstants(): {
  path: string;
  value: number;
  unit: string;
  source: string;
  editable?: [number, number];
}[] {
  const rows: {
    path: string;
    value: number;
    unit: string;
    source: string;
    editable?: [number, number];
  }[] = [];
  for (const [path, c] of constantMap()) {
    rows.push(
      c.editable
        ? { path, value: c.value, unit: c.unit, source: c.source, editable: c.editable }
        : { path, value: c.value, unit: c.unit, source: c.source },
    );
  }
  return rows;
}

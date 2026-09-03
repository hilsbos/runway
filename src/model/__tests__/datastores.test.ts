/**
 * Golden tests for the datastore head-to-head scaling lens (src/model/datastores.ts).
 *
 * All expected values are HAND-DERIVED from the CAPACITY constants (constants.ts),
 * NOT echoed from the implementation. Arithmetic is shown in comments.
 *
 * CAPACITY (locked):
 *   pg:    read 25000, write 12000, cost 600, rf 3, writeScales false
 *   cass:  read 50000, write 50000, cost 650, rf 3, writeScales true
 *   mongo: read 50000, write 25000, cost 550, rf 3, writeScales true
 *   yuga:  read 14000, write 6000,  cost 600, rf 3, writeScales true
 *   target_util = 0.7
 *   lat_db: postgres 2.5ms, cassandra 3ms, mongodb 4ms, yugabytedb 3ms
 */
import { describe, expect, it } from "vitest";
import { datastoreFacts, datastoreScaling } from "../datastores.ts";
import type { Db } from "../types.ts";

const facts = () => datastoreFacts();
const factOf = (db: Db) => datastoreFacts().find((f) => f.db === db)!;

describe("datastoreFacts", () => {
  it("mirrors the CAPACITY constants exactly (default aws/unmanaged => dmult 1)", () => {
    const pg = factOf("postgres");
    expect(pg.label).toBe("Postgres");
    expect(pg.readPerNode).toBe(25000);
    expect(pg.writePerNode).toBe(12000);
    expect(pg.costPerNode).toBe(600);
    expect(pg.rf).toBe(3);
    expect(pg.readLatencyMs).toBe(2.5);
    expect(pg.writeScales).toBe(false);

    const cass = factOf("cassandra");
    expect(cass.label).toBe("Cassandra");
    expect(cass.readPerNode).toBe(50000);
    expect(cass.writePerNode).toBe(50000);
    expect(cass.costPerNode).toBe(650);
    expect(cass.rf).toBe(3);
    expect(cass.readLatencyMs).toBe(3);
    expect(cass.writeScales).toBe(true);

    const mongo = factOf("mongodb");
    expect(mongo.label).toBe("MongoDB");
    expect(mongo.readPerNode).toBe(50000);
    expect(mongo.writePerNode).toBe(25000);
    expect(mongo.costPerNode).toBe(550);
    expect(mongo.rf).toBe(3);
    expect(mongo.readLatencyMs).toBe(4);
    expect(mongo.writeScales).toBe(true);

    // --- new single-primary relational engines ---
    const mysql = factOf("mysql");
    expect(mysql.label).toBe("MySQL");
    expect(mysql.readPerNode).toBe(28000);
    expect(mysql.writePerNode).toBe(14000);
    expect(mysql.costPerNode).toBe(600);
    expect(mysql.rf).toBe(3);
    expect(mysql.readLatencyMs).toBe(2.5);
    expect(mysql.writeScales).toBe(false);

    const aurora = factOf("aurora");
    expect(aurora.label).toBe("Aurora");
    expect(aurora.readPerNode).toBe(60000);
    expect(aurora.writePerNode).toBe(30000);
    expect(aurora.costPerNode).toBe(1100);
    expect(aurora.rf).toBe(3);
    expect(aurora.readLatencyMs).toBe(2);
    expect(aurora.writeScales).toBe(false);

    const oracle = factOf("oracledb");
    expect(oracle.label).toBe("Oracle");
    expect(oracle.readPerNode).toBe(35000);
    expect(oracle.writePerNode).toBe(18000);
    expect(oracle.costPerNode).toBe(3000);
    expect(oracle.rf).toBe(3);
    expect(oracle.readLatencyMs).toBe(3);
    expect(oracle.writeScales).toBe(false);

    // --- distributed SQL: ACID but scale-out writes (Raft leader per tablet) ---
    const yuga = factOf("yugabytedb");
    expect(yuga.label).toBe("YugabyteDB");
    expect(yuga.readPerNode).toBe(14000);
    expect(yuga.writePerNode).toBe(6000);
    expect(yuga.costPerNode).toBe(600);
    expect(yuga.rf).toBe(3);
    expect(yuga.readLatencyMs).toBe(3);
    expect(yuga.writeScales).toBe(true);
  });

  it("exposes the CAP-theorem / ACID-vs-BASE classification per engine", () => {
    // Single-primary relational engines: ACID + CP.
    for (const db of ["postgres", "mysql", "aurora", "oracledb"] as const) {
      const f = factOf(db);
      expect(f.consistency).toBe("ACID");
      expect(f.cap).toBe("CP");
      expect(f.capNote.length).toBeGreaterThan(0);
    }
    // Scale-out NoSQL stores: BASE; Cassandra AP, MongoDB CP.
    const cass = factOf("cassandra");
    expect(cass.consistency).toBe("BASE");
    expect(cass.cap).toBe("AP");
    const mongo = factOf("mongodb");
    expect(mongo.consistency).toBe("BASE");
    expect(mongo.cap).toBe("CP");
    expect(mongo.capNote).toMatch(/4\.0/); // notes the multi-document ACID nuance
    // Distributed SQL: ACID + CP like the relational engines, yet scale-out.
    const yuga = factOf("yugabytedb");
    expect(yuga.consistency).toBe("ACID");
    expect(yuga.cap).toBe("CP");
    expect(yuga.capNote).toMatch(/Raft/);
    expect(yuga.writeScales).toBe(true);
  });

  it("returns all seven datastores in display order", () => {
    expect(facts().map((f) => f.db)).toEqual([
      "postgres",
      "mysql",
      "aurora",
      "oracledb",
      "yugabytedb",
      "cassandra",
      "mongodb",
    ]);
  });

  it("single-primary engines have a write wall = writePerNode/(1-readFrac); scale-out are null", () => {
    // readFrac 0.9 -> wall = writePerNode / 0.1
    //   pg 12000->120k, mysql 14000->140k, aurora 30000->300k, oracle 18000->180k
    expect(factOf("mysql").writeCeilingRps).toBeCloseTo(140000, 3);
    expect(factOf("aurora").writeCeilingRps).toBeCloseTo(300000, 3);
    expect(factOf("oracledb").writeCeilingRps).toBeCloseTo(180000, 3);
    // scale-out stores never wall
    expect(factOf("cassandra").writeCeilingRps).toBeNull();
    expect(factOf("mongodb").writeCeilingRps).toBeNull();
    expect(factOf("yugabytedb").writeCeilingRps).toBeNull();
  });

  it("Postgres write wall = writePerNode / (1 - readFrac); scale-out DBs are null", () => {
    // default readFrac 0.9: pg ceiling = 12000 / (1 - 0.9) = 12000 / 0.1 = 120000
    expect(factOf("postgres").writeCeilingRps).toBeCloseTo(120000, 3);
    expect(factOf("cassandra").writeCeilingRps).toBeNull();
    expect(factOf("mongodb").writeCeilingRps).toBeNull();
  });

  it("Postgres write wall scales with readFrac", () => {
    // readFrac 0.8 -> 12000 / 0.2 = 60000 ; readFrac 0.95 -> 12000 / 0.05 = 240000
    expect(datastoreFacts({ readFrac: 0.8 }).find((f) => f.db === "postgres")!.writeCeilingRps).toBeCloseTo(60000, 3);
    expect(datastoreFacts({ readFrac: 0.95 }).find((f) => f.db === "postgres")!.writeCeilingRps).toBeCloseTo(240000, 3);
  });
});

describe("datastoreScaling — node math (hand-derived)", () => {
  // rps=200000, readFrac=0.9 -> reads=180000, writes=20000, tu=0.7, dmult=1 (aws/unmanaged)
  const curves = datastoreScaling({ maxRps: 200000, steps: 2, readFrac: 0.9 });
  const at200k = (db: Db) => curves.find((c) => c.db === db)!.points.at(-1)!;

  it("steps=2 -> floor (1) and maxRps (200000) endpoints", () => {
    const pg = curves.find((c) => c.db === "postgres")!;
    expect(pg.points).toHaveLength(2);
    expect(pg.points[0]!.rps).toBe(1);
    expect(pg.points[1]!.rps).toBe(200000);
  });

  it("Postgres @200k: reads 180000 -> 11 read nodes, write-pinned, writeCeiling", () => {
    // readNodes = ceil(180000 / (25000*0.7)) = ceil(180000/17500) = ceil(10.2857) = 11
    // writeNodes = 1 (single primary) ; nodes = max(rf=3, 11, 1) = 11
    // writes 20000 > 12000 -> writeCeiling true
    const p = at200k("postgres");
    expect(p.reads).toBe(180000);
    expect(p.writes).toBeCloseTo(20000, 6);
    expect(p.nodes).toBe(11);
    expect(p.writeCeiling).toBe(true);
    // cost = 11 * 600 * 1 = 6600
    expect(p.cost).toBe(6600);
  });

  it("Cassandra @200k: read-bound at 6 nodes, writes scale within, no ceiling", () => {
    // readNodes = ceil(180000 / (50000*0.7)) = ceil(180000/35000) = ceil(5.1428) = 6
    // writeNodes = ceil(20000 / (50000*0.7)) = ceil(20000/35000) = ceil(0.571) = 1
    // nodes = max(3, 6, 1) = 6
    const c = at200k("cassandra");
    expect(c.nodes).toBe(6);
    expect(c.writeCeiling).toBe(false);
    // cost = 6 * 650 = 3900
    expect(c.cost).toBe(3900);
  });

  it("MongoDB @200k: read-bound at 6 nodes (write needs 2), no ceiling", () => {
    // readNodes = ceil(180000/35000) = 6
    // writeNodes = ceil(20000 / (25000*0.7)) = ceil(20000/17500) = ceil(1.1428) = 2
    // nodes = max(3, 6, 2) = 6
    const m = at200k("mongodb");
    expect(m.nodes).toBe(6);
    expect(m.writeCeiling).toBe(false);
    // cost = 6 * 550 = 3300
    expect(m.cost).toBe(3300);
  });

  it("YugabyteDB @200k: read-bound at 19 nodes (write needs 5), no ceiling", () => {
    // readNodes  = ceil(180000 / (14000*0.7)) = ceil(180000/9800) = ceil(18.367) = 19
    // writeNodes = ceil(20000  / (6000*0.7))  = ceil(20000/4200)  = ceil(4.762)  = 5
    // nodes = max(3, 19, 5) = 19 ; writes scale out -> no ceiling
    // util = max(180000/(19*14000), 20000/(19*6000)) = max(0.67669, 0.17544) = 0.67669
    const y = at200k("yugabytedb");
    expect(y.nodes).toBe(19);
    expect(y.writeCeiling).toBe(false);
    expect(y.util).toBeCloseTo(180000 / 266000, 6);
    // cost = 19 * 600 = 11400
    expect(y.cost).toBe(11400);
  });

  it("MySQL @200k: reads 180000 -> 10 nodes, single-primary, writeCeiling", () => {
    // readNodes = ceil(180000 / (28000*0.7)) = ceil(180000/19600) = ceil(9.184) = 10
    // writeNodes = 1 ; nodes = max(3, 10, 1) = 10 ; writes 20000 > 14000 -> ceiling
    const my = at200k("mysql");
    expect(my.nodes).toBe(10);
    expect(my.writeCeiling).toBe(true);
    expect(my.cost).toBe(6000); // 10 * 600
  });

  it("Aurora @200k: reads 180000 -> 5 nodes, no ceiling yet (wall at 300k)", () => {
    // readNodes = ceil(180000 / (60000*0.7)) = ceil(180000/42000) = ceil(4.286) = 5
    // writeNodes = 1 ; nodes = max(3, 5, 1) = 5 ; writes 20000 < 30000 -> no ceiling
    const au = at200k("aurora");
    expect(au.nodes).toBe(5);
    expect(au.writeCeiling).toBe(false);
    expect(au.cost).toBe(5500); // 5 * 1100
  });

  it("Oracle @200k: reads 180000 -> 8 nodes, single-primary, writeCeiling", () => {
    // readNodes = ceil(180000 / (35000*0.7)) = ceil(180000/24500) = ceil(7.347) = 8
    // writeNodes = 1 ; nodes = max(3, 8, 1) = 8 ; writes 20000 > 18000 -> ceiling
    const or = at200k("oracledb");
    expect(or.nodes).toBe(8);
    expect(or.writeCeiling).toBe(true);
    expect(or.cost).toBe(24000); // 8 * 3000
  });
});

describe("datastoreScaling — write wall & monotonicity", () => {
  const curves = datastoreScaling({ maxRps: 300000, steps: 64, readFrac: 0.9 });

  it("Postgres points beyond the 120k wall flip writeCeiling true; before, false", () => {
    // wall = 12000/0.1 = 120000 rps total; writeCeiling triggers when writes(=rps*0.1) > 12000
    const pg = curves.find((c) => c.db === "postgres")!;
    for (const p of pg.points) {
      // writes = rps * (1 - 0.9) = rps * 0.1
      const expected = p.rps * 0.1 > 12000;
      expect(p.writeCeiling).toBe(expected);
    }
    // sanity: at least one point past the wall in a 300k sweep
    expect(pg.points.some((p) => p.writeCeiling)).toBe(true);
    expect(pg.points.some((p) => !p.writeCeiling)).toBe(true);
  });

  it("Cassandra, MongoDB and YugabyteDB never hit a write ceiling", () => {
    for (const db of ["cassandra", "mongodb", "yugabytedb"] as const) {
      const c = curves.find((x) => x.db === db)!;
      expect(c.points.every((p) => p.writeCeiling === false)).toBe(true);
    }
  });

  it("node counts are monotonic nondecreasing in rps for every DB", () => {
    for (const c of curves) {
      for (let i = 1; i < c.points.length; i++) {
        expect(c.points[i]!.nodes).toBeGreaterThanOrEqual(c.points[i - 1]!.nodes);
      }
    }
  });

  it("cost is monotonic nondecreasing in rps for every DB", () => {
    for (const c of curves) {
      for (let i = 1; i < c.points.length; i++) {
        expect(c.points[i]!.cost).toBeGreaterThanOrEqual(c.points[i - 1]!.cost);
      }
    }
  });
});

describe("datastoreScaling — guards & economics", () => {
  it("steps < 2 is clamped to 2", () => {
    const curves = datastoreScaling({ maxRps: 1000, steps: 1 });
    expect(curves[0]!.points).toHaveLength(2);
  });

  it("readFrac is clamped into [0.5, 1]", () => {
    // readFrac 0.2 -> clamped to 0.5 -> pg wall = 12000/0.5 = 24000
    expect(datastoreFacts({ readFrac: 0.2 }).find((f) => f.db === "postgres")!.writeCeilingRps).toBe(24000);
  });

  it("default provider/managed => dmult = 1 (base AWS economics)", () => {
    // At 200k rps Cassandra = 6 nodes * 650 = 3900 with dmult 1
    const c = datastoreScaling({ maxRps: 200000, steps: 2 })
      .find((x) => x.db === "cassandra")!
      .points.at(-1)!;
    expect(c.cost).toBe(3900);
  });

  it("managed=true applies the managed_mult (1.6) premium on cost", () => {
    // Cassandra @200k: 6 * 650 * 1.6 = 6240
    const c = datastoreScaling({ maxRps: 200000, steps: 2, managed: true })
      .find((x) => x.db === "cassandra")!
      .points.at(-1)!;
    expect(c.cost).toBeCloseTo(6240, 6);
  });

  it("onprem storage multiplier (0.5) lowers cost", () => {
    // Cassandra @200k onprem: 6 * 650 * 0.5 = 1950
    const c = datastoreScaling({ maxRps: 200000, steps: 2, provider: "onprem" })
      .find((x) => x.db === "cassandra")!
      .points.at(-1)!;
    expect(c.cost).toBeCloseTo(1950, 6);
  });

  it("costPerNode reflects provider+managed economics and reconciles with the cost curve", () => {
    // gcp storage 1.05 * managed_mult 1.6 = dmult 1.68 ; cassandra 650 * 1.68 = 1092
    const cass = datastoreFacts({ provider: "gcp", managed: true }).find((f) => f.db === "cassandra")!;
    expect(cass.costPerNode).toBeCloseTo(1092, 6);
    // the facts $/node must equal the scaling curve's implied per-node cost
    const end = datastoreScaling({ maxRps: 200000, steps: 2, provider: "gcp", managed: true })
      .find((c) => c.db === "cassandra")!
      .points.at(-1)!;
    expect(end.cost / end.nodes).toBeCloseTo(cass.costPerNode, 6);
  });

  it("overrides are sanitized then applied (pg.write raised moves the wall)", () => {
    // pg.write override 16000 (within editable [2000,100000]); readFrac 0.9 -> wall = 16000/0.1 = 160000
    const f = datastoreFacts({ overrides: { "pg.write": 16000 } }).find((x) => x.db === "postgres")!;
    expect(f.writePerNode).toBe(16000);
    expect(f.writeCeilingRps).toBeCloseTo(160000, 3);
  });
});

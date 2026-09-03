/**
 * Datastore tier. Reads scale via replicas; writes either scale out (Cassandra
 * /Mongo) or are pinned to a single primary (Postgres → write ceiling).
 * See MODEL-SPEC §1.2 (4).
 */
import type { ComponentResult, Db } from "../types.ts";
import { DB_KEY } from "../constants.ts";

export interface DatastoreResult extends ComponentResult {
  writeCeiling: boolean;
}

export function computeDatastore(
  g: (path: string) => number,
  db: Db,
  dbReads: number,
  writes: number,
  dmult: number,
  writeScales: boolean,
): DatastoreResult {
  const key = DB_KEY[db];
  const rPer = g(`${key}.read`);
  const wPer = g(`${key}.write`);
  const cPer = g(`${key}.cost`);
  const rf = g(`${key}.rf`);
  const tu = g("target_util");

  const readNodes = Math.ceil(dbReads / (rPer * tu));
  const writeNodes = writeScales ? Math.ceil(writes / (wPer * tu)) : 1;
  const writeCeiling = !writeScales && writes > wPer;
  const nodes = Math.max(rf, readNodes, writeNodes);
  const util = Math.max(
    dbReads / (nodes * rPer),
    writes / ((writeScales ? nodes : 1) * wPer),
  );
  const cost = nodes * cPer * dmult;
  return { nodes, util, cost, writeCeiling };
}

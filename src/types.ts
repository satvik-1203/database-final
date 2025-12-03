/**
 * Core types and interfaces for the distributed transaction simulator
 */

export type SiteState = "Up" | "Failed" | "Recovering";
export type TransactionStatus = "Active" | "Committed" | "Aborted";

export interface Version {
  timestamp: number;
  value: number;
}

export interface Transaction {
  id: string;
  status: TransactionStatus;
  beginTimestamp: number;
  commitTimestamp?: number;
  readSet: Map<number, { siteId: number; timestamp: number }>; // variable -> {site, timestamp}
  writeSet: Map<number, { value: number; targetSites: number[] }>; // variable -> {value, sites to write to}
  touchedSites: Set<number>;
}

export interface Site {
  id: number;
  state: SiteState;
  uptimeIntervals: Array<{ start: number; end?: number }>;
  variables: Map<number, Version[]>; // variable -> versions
  replicatedReadEnabled: Map<number, boolean>; // variable -> canRead (for recovering sites)
}

export interface SerializationGraphNode {
  transactionId: string;
  edges: Set<string>; // outgoing edges to other transactions
}

export interface CommandResult {
  success: boolean;
  message?: string;
  value?: number;
}

export type Command =
  | { type: "begin"; transactionId: string }
  | { type: "end"; transactionId: string }
  | { type: "read"; transactionId: string; variable: number }
  | { type: "write"; transactionId: string; variable: number; value: number }
  | { type: "fail"; siteId: number }
  | { type: "recover"; siteId: number }
  | { type: "dump" }
  | { type: "dumpVariable"; variable: number }
  | { type: "dumpSite"; siteId: number }
  | { type: "reset" };


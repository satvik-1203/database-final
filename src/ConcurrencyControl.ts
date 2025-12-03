/**
 * ConcurrencyControl: Enforces snapshot isolation and serializability
 * Uses First-Committer-Wins and serialization graph for cycle detection
 */

import type { SerializationGraphNode, Transaction } from "./types";

export class ConcurrencyControl {
  // Track the last writer for each variable (for first-committer-wins)
  private lastWriter: Map<
    number,
    { transactionId: string; commitTime: number }
  >;

  // Serialization graph for cycle detection
  private graph: Map<string, SerializationGraphNode>;

  // Track which transaction wrote which variables and at what time
  private writeHistory: Map<string, Map<number, number>>; // txId -> (varId -> commitTime)

  // Track which transaction read which variables (for RW dependencies)
  private readHistory: Map<string, Set<number>>; // txId -> set of variables read

  constructor() {
    this.lastWriter = new Map();
    this.graph = new Map();
    this.writeHistory = new Map();
    this.readHistory = new Map();
  }

  /**
   * Register a transaction in the graph
   */
  // registerTransaction(transactionId: string) -> void: add tx node to graph
  registerTransaction(transactionId: string): void {
    if (!this.graph.has(transactionId)) {
      this.graph.set(transactionId, {
        transactionId,
        edges: new Set(),
      });
    }
  }

  /**
   * Record a read operation (creates RW dependency)
   * If T1 reads a version written by T2, and T1 commits after T2, add edge T2 -> T1
   */
  // recordRead(readerId: string, variableId: number, versionTimestamp: number) -> void: track read and add RW edge
  recordRead(
    readerId: string,
    variableId: number,
    versionTimestamp: number
  ): void {
    this.registerTransaction(readerId);

    // Track that this transaction read this variable
    if (!this.readHistory.has(readerId)) {
      this.readHistory.set(readerId, new Set());
    }
    this.readHistory.get(readerId)!.add(variableId);

    // Find the transaction that wrote this version
    for (const [writerId, varMap] of this.writeHistory.entries()) {
      const commitTime = varMap.get(variableId);
      if (commitTime === versionTimestamp) {
        // Found the writer, add edge: writer -> reader (RW dependency)
        this.addEdge(writerId, readerId);
        break;
      }
    }
  }

  /**
   * Check if a transaction can commit (First-Committer-Wins)
   * Returns { canCommit: true } or { canCommit: false, reason: string }
   */
  // checkFirstCommitterWins(transactionId: string, transaction: Transaction) -> { canCommit: boolean; reason?: string }
  checkFirstCommitterWins(
    transactionId: string,
    transaction: Transaction
  ): { canCommit: boolean; reason?: string } {
    // Check for write-write conflicts
    for (const [varId] of transaction.writeSet.entries()) {
      const lastWriterInfo = this.lastWriter.get(varId);

      if (lastWriterInfo) {
        // Another transaction wrote to this variable
        // Check if it committed after this transaction began
        if (lastWriterInfo.commitTime > transaction.beginTimestamp) {
          // Conflict: another transaction committed a write after this transaction started
          // and before this transaction is committing
          return {
            canCommit: false,
            reason: `First-committer-wins conflict on x${varId} with ${lastWriterInfo.transactionId}`,
          };
        }
      }
    }

    return { canCommit: true };
  }

  /**
   * Check for serialization cycles before committing
   * Returns { canCommit: true } or { canCommit: false, reason: string }
   */
  // checkSerializability(transactionId: string, transaction: Transaction) -> { canCommit: boolean; reason?: string }
  checkSerializability(
    transactionId: string,
    transaction: Transaction
  ): { canCommit: boolean; reason?: string } {
    // Add WW edges for write-write dependencies
    for (const [varId] of transaction.writeSet.entries()) {
      const lastWriterInfo = this.lastWriter.get(varId);
      if (lastWriterInfo && lastWriterInfo.transactionId !== transactionId) {
        // Add edge: lastWriter -> currentTransaction (WW dependency)
        this.addEdge(lastWriterInfo.transactionId, transactionId);
      }
    }

    // Add RW anti-dependency edges: for each variable this transaction writes,
    // check if any other transaction has read that variable.
    // If current (writer) writes x and other (reader) has read x, add edge: reader -> writer.
    // This captures the anti-dependency needed for cycle detection under SI.
    for (const [varId] of transaction.writeSet.entries()) {
      // Check all transactions that have read this variable
      for (const [otherTxId, readVars] of this.readHistory.entries()) {
        if (otherTxId !== transactionId && readVars.has(varId)) {
          // Other transaction read this variable that we're about to write
          // Add edge: other transaction (reader) -> this transaction (writer)
          this.addEdge(otherTxId, transactionId);
        }
      }
    }

    // Check for cycles
    if (this.hasCycle(transactionId)) {
      return {
        canCommit: false,
        reason: "Serialization cycle detected",
      };
    }

    return { canCommit: true };
  }

  /**
   * Commit a transaction: update last writers and write history
   */
  // commitTransaction(transactionId: string, transaction: Transaction, commitTime: number) -> void
  commitTransaction(
    transactionId: string,
    transaction: Transaction,
    commitTime: number
  ): void {
    // Update last writer for each written variable
    for (const [varId] of transaction.writeSet.entries()) {
      this.lastWriter.set(varId, {
        transactionId,
        commitTime,
      });
    }

    // Record write history
    const varMap = new Map<number, number>();
    for (const [varId] of transaction.writeSet.entries()) {
      varMap.set(varId, commitTime);
    }
    this.writeHistory.set(transactionId, varMap);
  }

  /**
   * Abort a transaction: remove from graph
   */
  // abortTransaction(transactionId: string) -> void
  abortTransaction(transactionId: string): void {
    // Remove the transaction node and all edges
    this.graph.delete(transactionId);

    // Remove edges pointing to this transaction
    for (const node of this.graph.values()) {
      node.edges.delete(transactionId);
    }

    // Clean up write history
    this.writeHistory.delete(transactionId);

    // Clean up read history
    this.readHistory.delete(transactionId);
  }

  /**
   * Add an edge to the serialization graph
   */
  // addEdge(fromId: string, toId: string) -> void
  private addEdge(fromId: string, toId: string): void {
    this.registerTransaction(fromId);
    this.registerTransaction(toId);

    const fromNode = this.graph.get(fromId);
    if (fromNode) {
      fromNode.edges.add(toId);
    }
  }

  /**
   * Detect cycles in the serialization graph using DFS
   */
  // hasCycle(startNode: string) -> boolean
  private hasCycle(startNode: string): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        recStack.add(nodeId);

        const node = this.graph.get(nodeId);
        if (node) {
          for (const neighbor of node.edges) {
            if (!visited.has(neighbor)) {
              if (dfs(neighbor)) {
                return true;
              }
            } else if (recStack.has(neighbor)) {
              return true; // Cycle detected
            }
          }
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    // Check for cycle starting from startNode
    return dfs(startNode);
  }

  /**
   * Get write history for debugging
   */
  // getWriteHistory(transactionId: string) -> Map<number, number> | undefined
  getWriteHistory(transactionId: string): Map<number, number> | undefined {
    return this.writeHistory.get(transactionId);
  }
}

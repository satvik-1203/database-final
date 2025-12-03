/**
 * TransactionManager: Manages transaction lifecycle, timestamps, and commit/abort decisions
 */

import type { Transaction, TransactionStatus } from "./types.js";
import { ConcurrencyControl } from "./ConcurrencyControl.js";
import type { ReplicationRouter } from "./ReplicationRouter.js";
import type { VersionStore } from "./VersionStore.js";
import type { SiteManager } from "./SiteManager.js";

export class TransactionManager {
  private transactions: Map<string, Transaction>;
  private currentTime: number;

  constructor(
    private concurrencyControl: ConcurrencyControl,
    private replicationRouter: ReplicationRouter,
    private versionStore: VersionStore,
    private siteManager: SiteManager
  ) {
    this.transactions = new Map();
    this.currentTime = 1;
  }

  /**
   * Start a new transaction
   */
  // begin(transactionId: string) -> void: create and register an active transaction
  begin(transactionId: string): void {
    if (this.transactions.has(transactionId)) {
      console.log(`${transactionId} already exists`);
      return;
    }

    const transaction: Transaction = {
      id: transactionId,
      status: "Active",
      beginTimestamp: this.currentTime,
      readSet: new Map(),
      writeSet: new Map(),
      touchedSites: new Set(),
    };

    this.transactions.set(transactionId, transaction);
    this.concurrencyControl.registerTransaction(transactionId);

    this.currentTime++;
  }

  /**
   * Read a variable
   */
  // read(transactionId: string, variableId: number) -> number | null: return snapshot value or null
  read(transactionId: string, variableId: number): number | null {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      console.log(`${transactionId} does not exist`);
      return null;
    }

    if (transaction.status !== "Active") {
      console.log(`${transactionId} is not active`);
      return null;
    }

    // Check if the transaction has already written to this variable
    if (transaction.writeSet.has(variableId)) {
      const writeEntry = transaction.writeSet.get(variableId)!;
      console.log(
        `${transactionId}: R(x${variableId}) -> ${writeEntry.value} (from write set)`
      );
      return writeEntry.value;
    }

    // Try to read from a site
    const readResult = this.replicationRouter.selectReadSite(
      variableId,
      transaction.beginTimestamp
    );

    if (!readResult) {
      console.log(
        `${transactionId}: R(x${variableId}) -> cannot read (no eligible site)`
      );
      return null;
    }

    const { siteId, versionTimestamp } = readResult;
    const version = this.versionStore.getVersion(
      siteId,
      variableId,
      transaction.beginTimestamp
    );

    if (!version) {
      console.log(
        `${transactionId}: R(x${variableId}) -> cannot read (no version)`
      );
      return null;
    }

    // Record the read
    transaction.readSet.set(variableId, {
      siteId,
      timestamp: versionTimestamp,
    });
    transaction.touchedSites.add(siteId);

    // Record read for concurrency control (RW dependency)
    this.concurrencyControl.recordRead(
      transactionId,
      variableId,
      versionTimestamp
    );

    console.log(`${transactionId}: R(x${variableId}) -> ${version.value}`);
    return version.value;
  }

  /**
   * Write a variable (buffered)
   */
  // write(transactionId: string, variableId: number, value: number) -> void: buffer write to eligible sites
  write(transactionId: string, variableId: number, value: number): void {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      console.log(`${transactionId} does not exist`);
      return;
    }

    if (transaction.status !== "Active") {
      console.log(`${transactionId} is not active`);
      return;
    }

    // Determine target sites NOW (at write time, not commit time)
    const targetSites = this.replicationRouter.selectWriteSites(variableId);

    // Buffer the write with target sites
    transaction.writeSet.set(variableId, { value, targetSites });

    // Mark the target sites as touched so failures on these sites abort the txn
    for (const siteId of targetSites) {
      transaction.touchedSites.add(siteId);
    }
  }

  /**
   * Attempt to commit or abort a transaction
   */
  // end(transactionId: string) -> void: validate and commit or abort the transaction
  end(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      console.log(`${transactionId} does not exist`);
      return;
    }

    if (transaction.status !== "Active") {
      console.log(
        `${transactionId} is already ${transaction.status.toLowerCase()}`
      );
      return;
    }

    // Check if any touched sites have failed
    for (const siteId of transaction.touchedSites) {
      if (!this.siteManager.isAvailable(siteId)) {
        this.abort(transactionId, "site failure after access");
        return;
      }
    }

    // Check if write sites are still available
    for (const [varId, writeEntry] of transaction.writeSet.entries()) {
      const availableTargetSites = writeEntry.targetSites.filter((siteId) =>
        this.siteManager.isAvailable(siteId)
      );
      if (availableTargetSites.length === 0) {
        this.abort(transactionId, "no available site for write");
        return;
      }
    }

    // Check first-committer-wins
    const fcwResult = this.concurrencyControl.checkFirstCommitterWins(
      transactionId,
      transaction
    );

    if (!fcwResult.canCommit) {
      this.abort(
        transactionId,
        fcwResult.reason || "first-committer-wins violation"
      );
      return;
    }

    // Check serializability
    const serResult = this.concurrencyControl.checkSerializability(
      transactionId,
      transaction
    );

    if (!serResult.canCommit) {
      this.abort(
        transactionId,
        serResult.reason || "serializability violation"
      );
      return;
    }

    // Commit the transaction
    this.commit(transactionId);
  }

  /**
   * Commit a transaction
   */
  // commit(transactionId: string) -> void: install writes and finalize commit
  private commit(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return;
    }

    const commitTime = this.currentTime;
    transaction.status = "Committed";
    transaction.commitTimestamp = commitTime;

    // Install writes to the sites that were eligible at write time
    for (const [varId, writeEntry] of transaction.writeSet.entries()) {
      // Only write to sites that are STILL available at commit time
      const availableTargetSites = writeEntry.targetSites.filter((siteId) =>
        this.siteManager.isAvailable(siteId)
      );

      for (const siteId of availableTargetSites) {
        this.versionStore.addVersion(
          siteId,
          varId,
          commitTime,
          writeEntry.value
        );

        // Enable reads for replicated variables at recovering sites
        if (this.siteManager.isReplicated(varId)) {
          this.siteManager.enableReplicatedRead(siteId, varId);
        }
      }
    }

    // Notify concurrency control
    this.concurrencyControl.commitTransaction(
      transactionId,
      transaction,
      commitTime
    );

    console.log(`${transactionId} commits`);
    this.currentTime++;
  }

  /**
   * Abort a transaction
   */
  // abort(transactionId: string, reason: string) -> void: mark aborted and notify CC
  private abort(transactionId: string, reason: string): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return;
    }

    transaction.status = "Aborted";

    // Notify concurrency control
    this.concurrencyControl.abortTransaction(transactionId);

    console.log(`${transactionId} aborts (${reason})`);
  }

  /**
   * Handle site failure - abort transactions that accessed the failed site
   */
  // handleSiteFailure(siteId: number) -> void: abort active txns that touched site
  handleSiteFailure(siteId: number): void {
    for (const [txId, transaction] of this.transactions.entries()) {
      if (
        transaction.status === "Active" &&
        transaction.touchedSites.has(siteId)
      ) {
        this.abort(txId, `site ${siteId} failed`);
      }
    }
  }

  /**
   * Dump all variables across all sites
   */
  // dump() -> void: print changed variables summary
  dump(): void {
    const NUM_VARIABLES = 20;
    const changedVariables: string[] = [];
    let hasChanges = false;

    for (let varId = 1; varId <= NUM_VARIABLES; varId++) {
      const initialValue = varId * 10; // x1=10, x2=20, etc.
      const sites = this.replicationRouter.getSitesForVariable(varId);
      const isReplicated = this.siteManager.isReplicated(varId);

      if (isReplicated) {
        // Get value from first available site
        const firstSite = sites[0];
        if (firstSite !== undefined) {
          const version = this.versionStore.getLatestVersion(firstSite, varId);
          if (version && version.value !== initialValue) {
            changedVariables.push(`x${varId}: ${version.value} at all sites`);
            hasChanges = true;
          }
        }
      } else {
        // Non-replicated: show the single site
        const siteId = sites[0];
        if (siteId !== undefined) {
          const version = this.versionStore.getLatestVersion(siteId, varId);
          if (version && version.value !== initialValue) {
            changedVariables.push(
              `x${varId}: ${version.value} at site ${siteId}`
            );
            hasChanges = true;
          }
        }
      }
    }

    // Print changed variables
    for (const line of changedVariables) {
      console.log(line);
    }

    // Always print the summary message
    if (hasChanges) {
      console.log("All other variables have their initial values.");
    } else {
      console.log("All variables have their initial values.");
    }
  }

  /**
   * Dump a specific variable
   */
  // dumpVariable(variableId: number) -> void: print latest values across sites
  dumpVariable(variableId: number): void {
    const sites = this.replicationRouter.getSitesForVariable(variableId);
    const isReplicated = this.siteManager.isReplicated(variableId);

    if (isReplicated) {
      const values: string[] = [];
      for (const siteId of sites) {
        const version = this.versionStore.getLatestVersion(siteId, variableId);
        if (version) {
          values.push(`${version.value} at site ${siteId}`);
        }
      }
      console.log(`x${variableId}: ${values.join(", ")}`);
    } else {
      const siteId = sites[0];
      if (siteId !== undefined) {
        const version = this.versionStore.getLatestVersion(siteId, variableId);
        if (version) {
          console.log(`x${variableId}: ${version.value} at site ${siteId}`);
        }
      }
    }
  }

  /**
   * Dump a specific site
   */
  // dumpSite(siteId: number) -> void: print all variable values at site
  dumpSite(siteId: number): void {
    const variables = this.versionStore.getAllVariables(siteId);
    const sortedVars = Array.from(variables.entries()).sort(
      (a, b) => a[0] - b[0]
    );

    for (const [varId, version] of sortedVars) {
      console.log(`x${varId}: ${version.value}`);
    }
  }

  /**
   * Get current time
   */
  // getCurrentTime() -> number: return current logical time
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Advance time (for fail/recover operations)
   */
  // advanceTime() -> void: increment logical time
  advanceTime(): void {
    this.currentTime++;
  }
}

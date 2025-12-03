/**
 * VersionStore: Manages committed versions per site per variable
 * Provides snapshot queries to retrieve versions based on timestamps
 */

import type { Version } from "./types.js";

export class VersionStore {
  // siteId -> variableId -> versions[]
  private store: Map<number, Map<number, Version[]>>;

  constructor() {
    this.store = new Map();
  }

  /**
   * Initialize a site with its variables
   */
  // initializeSite(siteId: number, variableIds: number[]) -> void
  initializeSite(siteId: number, variableIds: number[]): void {
    const siteStore = new Map<number, Version[]>();
    for (const varId of variableIds) {
      // Initial value: x1=10, x2=20, x3=30, etc.
      siteStore.set(varId, [{ timestamp: 0, value: varId * 10 }]);
    }
    this.store.set(siteId, siteStore);
  }

  /**
   * Add a committed version to a site
   */
  // addVersion(siteId: number, variableId: number, timestamp: number, value: number) -> void
  addVersion(
    siteId: number,
    variableId: number,
    timestamp: number,
    value: number
  ): void {
    const siteStore = this.store.get(siteId);
    if (!siteStore) {
      throw new Error(`Site ${siteId} not found in version store`);
    }

    const versions = siteStore.get(variableId);
    if (!versions) {
      throw new Error(`Variable x${variableId} not found at site ${siteId}`);
    }

    versions.push({ timestamp, value });
  }

  /**
   * Get the latest version of a variable at a site up to a given timestamp
   */
  // getVersion(siteId: number, variableId: number, timestamp: number) -> Version | null
  getVersion(
    siteId: number,
    variableId: number,
    timestamp: number
  ): Version | null {
    const siteStore = this.store.get(siteId);
    if (!siteStore) {
      return null;
    }

    const versions = siteStore.get(variableId);
    if (!versions || versions.length === 0) {
      return null;
    }

    // Find the latest version with timestamp <= given timestamp
    let latestVersion: Version | null = null;
    for (const version of versions) {
      if (version.timestamp <= timestamp) {
        if (!latestVersion || version.timestamp > latestVersion.timestamp) {
          latestVersion = version;
        }
      }
    }

    return latestVersion;
  }

  /**
   * Get the latest committed version of a variable at a site
   */
  // getLatestVersion(siteId: number, variableId: number) -> Version | null
  getLatestVersion(siteId: number, variableId: number): Version | null {
    const siteStore = this.store.get(siteId);
    if (!siteStore) {
      return null;
    }

    const versions = siteStore.get(variableId);
    if (!versions || versions.length === 0) {
      return null;
    }

    return versions[versions.length - 1]!;
  }

  /**
   * Get the timestamp of the latest committed version of a variable at a site
   */
  // getLatestVersionTimestamp(siteId: number, variableId: number) -> number | null
  getLatestVersionTimestamp(siteId: number, variableId: number): number | null {
    const version = this.getLatestVersion(siteId, variableId);
    return version ? version.timestamp : null;
  }

  /**
   * Check if a site has a variable
   */
  // hasVariable(siteId: number, variableId: number) -> boolean
  hasVariable(siteId: number, variableId: number): boolean {
    const siteStore = this.store.get(siteId);
    return siteStore ? siteStore.has(variableId) : false;
  }

  /**
   * Get all variables at a site for dump
   */
  // getAllVariables(siteId: number) -> Map<number, Version>
  getAllVariables(siteId: number): Map<number, Version> {
    const siteStore = this.store.get(siteId);
    const result = new Map<number, Version>();

    if (siteStore) {
      for (const [varId, versions] of siteStore.entries()) {
        if (versions.length > 0) {
          result.set(varId, versions[versions.length - 1]!);
        }
      }
    }

    return result;
  }
}

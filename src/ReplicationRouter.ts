/**
 * ReplicationRouter: Chooses sites for reads and writes based on availability and replication
 */

import type { SiteManager } from "./SiteManager.js";
import type { VersionStore } from "./VersionStore.js";

export class ReplicationRouter {
  constructor(
    private siteManager: SiteManager,
    private versionStore: VersionStore
  ) {}

  /**
   * Select a site for reading a variable at a given timestamp
   * Returns the site ID and the version timestamp, or null if no eligible site
   */
  // selectReadSite(variableId: number, beginTimestamp: number) -> { siteId: number; versionTimestamp: number } | null
  selectReadSite(
    variableId: number,
    beginTimestamp: number
  ): { siteId: number; versionTimestamp: number } | null {
    const isReplicated = this.siteManager.isReplicated(variableId);

    if (isReplicated) {
      // Try all available sites
      const availableSites = this.siteManager.getAvailableSites();

      for (const siteId of availableSites) {
        if (this.canReadFromSite(siteId, variableId, beginTimestamp)) {
          const version = this.versionStore.getVersion(
            siteId,
            variableId,
            beginTimestamp
          );
          if (version) {
            // Check if site was continuously up from version commit to begin timestamp
            if (
              this.siteManager.wasContinuouslyUp(
                siteId,
                version.timestamp,
                beginTimestamp
              )
            ) {
              return { siteId, versionTimestamp: version.timestamp };
            }
          }
        }
      }

      return null;
    } else {
      // Non-replicated: only one site has it
      const siteId = this.siteManager.getSiteForVariable(variableId);

      if (this.canReadFromSite(siteId, variableId, beginTimestamp)) {
        const version = this.versionStore.getVersion(
          siteId,
          variableId,
          beginTimestamp
        );
        if (version) {
          // Check if site was continuously up from version commit to begin timestamp
          if (
            this.siteManager.wasContinuouslyUp(
              siteId,
              version.timestamp,
              beginTimestamp
            )
          ) {
            return { siteId, versionTimestamp: version.timestamp };
          }
        }
      }

      return null;
    }
  }

  /**
   * Select sites for writing a variable
   * For replicated variables, return all available sites
   * For non-replicated, return the single site (if available)
   */
  // selectWriteSites(variableId: number) -> number[]
  selectWriteSites(variableId: number): number[] {
    const isReplicated = this.siteManager.isReplicated(variableId);

    if (isReplicated) {
      // Write to all available sites
      return this.siteManager.getAvailableSites().filter((siteId) => {
        return this.versionStore.hasVariable(siteId, variableId);
      });
    } else {
      // Write to the single site that has this variable
      const siteId = this.siteManager.getSiteForVariable(variableId);
      return this.siteManager.isAvailable(siteId) ? [siteId] : [];
    }
  }

  /**
   * Check if a site can be used for reading a variable
   */
  // canReadFromSite(siteId: number, variableId: number, beginTimestamp: number) -> boolean
  private canReadFromSite(
    siteId: number,
    variableId: number,
    beginTimestamp: number
  ): boolean {
    // Site must be available
    if (!this.siteManager.isAvailable(siteId)) {
      return false;
    }

    // Site must have the variable
    if (!this.versionStore.hasVariable(siteId, variableId)) {
      return false;
    }

    // Check if site can read this variable (handles recovering sites)
    if (!this.siteManager.canRead(siteId, variableId)) {
      return false;
    }

    return true;
  }

  /**
   * Get all sites that have a variable (for dump)
   */
  // getSitesForVariable(variableId: number) -> number[]
  getSitesForVariable(variableId: number): number[] {
    const allSites = this.siteManager.getAllSiteIds();
    return allSites.filter((siteId) =>
      this.versionStore.hasVariable(siteId, variableId)
    );
  }
}

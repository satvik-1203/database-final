/**
 * SiteManager: Tracks site states (Up/Failed/Recovering) and manages availability
 */

import type { Site, SiteState } from "./types.js";
import type { VersionStore } from "./VersionStore.js";

export class SiteManager {
  private sites: Map<number, Site>;
  private readonly NUM_SITES = 10;
  private readonly NUM_VARIABLES = 20;

  constructor(private versionStore: VersionStore) {
    this.sites = new Map();
    this.initializeSites();
  }

  /**
   * Initialize all sites with their variables
   * Even-indexed variables (x2, x4, ..., x20) are replicated at all sites
   * Odd-indexed variables (x1, x3, ..., x19) are at one site: 1 + ((i-1) mod 10)
   */
  private initializeSites(): void {
    for (let siteId = 1; siteId <= this.NUM_SITES; siteId++) {
      const variableIds: number[] = [];

      // Add all even-indexed variables (replicated)
      for (let i = 2; i <= this.NUM_VARIABLES; i += 2) {
        variableIds.push(i);
      }

      // Add odd-indexed variables that belong to this site
      for (let i = 1; i <= this.NUM_VARIABLES; i += 2) {
        const belongsToSite = 1 + ((i - 1) % 10);
        if (belongsToSite === siteId) {
          variableIds.push(i);
        }
      }

      const site: Site = {
        id: siteId,
        state: "Up",
        uptimeIntervals: [{ start: 0 }],
        variables: new Map(),
        replicatedReadEnabled: new Map(),
      };

      // Initialize read-enabled flags for replicated variables
      for (let i = 2; i <= this.NUM_VARIABLES; i += 2) {
        site.replicatedReadEnabled.set(i, true);
      }

      this.sites.set(siteId, site);
      this.versionStore.initializeSite(siteId, variableIds);
    }
  }

  /**
   * Fail a site
   */
  // fail(siteId: number, currentTime: number) -> void: mark site failed and close uptime
  fail(siteId: number, currentTime: number): void {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Site ${siteId} does not exist`);
    }

    if (site.state === "Failed") {
      return; // Already failed
    }

    site.state = "Failed";

    // Close the current uptime interval
    const lastInterval = site.uptimeIntervals[site.uptimeIntervals.length - 1];
    if (lastInterval && lastInterval.end === undefined) {
      lastInterval.end = currentTime;
    }
  }

  /**
   * Recover a site
   */
  // recover(siteId: number, currentTime: number) -> void: mark recovering, open uptime, disable replicated reads
  recover(siteId: number, currentTime: number): void {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Site ${siteId} does not exist`);
    }

    if (site.state !== "Failed") {
      return; // Not failed
    }

    site.state = "Recovering";

    // Start a new uptime interval
    site.uptimeIntervals.push({ start: currentTime });

    // Disable reads for all replicated variables until a write occurs
    for (let i = 2; i <= this.NUM_VARIABLES; i += 2) {
      if (this.versionStore.hasVariable(siteId, i)) {
        site.replicatedReadEnabled.set(i, false);
      }
    }
  }

  /**
   * Enable reads for a replicated variable at a site after a commit
   */
  // enableReplicatedRead(siteId: number, variableId: number) -> void: enable reads and possibly mark site Up
  enableReplicatedRead(siteId: number, variableId: number): void {
    const site = this.sites.get(siteId);
    if (!site) {
      return;
    }

    if (site.state === "Recovering" && this.isReplicated(variableId)) {
      site.replicatedReadEnabled.set(variableId, true);

      // Check if all replicated variables are now enabled, if so, move to Up
      let allEnabled = true;
      for (let i = 2; i <= this.NUM_VARIABLES; i += 2) {
        if (this.versionStore.hasVariable(siteId, i)) {
          if (!site.replicatedReadEnabled.get(i)) {
            allEnabled = false;
            break;
          }
        }
      }

      if (allEnabled) {
        site.state = "Up";
      }
    }
  }

  /**
   * Check if a site is available for reads/writes
   */
  // isAvailable(siteId: number) -> boolean
  isAvailable(siteId: number): boolean {
    const site = this.sites.get(siteId);
    return site ? site.state !== "Failed" : false;
  }

  /**
   * Check if a site was continuously up during a time interval
   */
  // wasContinuouslyUp(siteId: number, startTime: number, endTime: number) -> boolean
  wasContinuouslyUp(
    siteId: number,
    startTime: number,
    endTime: number
  ): boolean {
    const site = this.sites.get(siteId);
    if (!site) {
      return false;
    }

    // Check if there's an uptime interval that covers [startTime, endTime]
    for (const interval of site.uptimeIntervals) {
      if (
        interval.start <= startTime &&
        (interval.end === undefined || interval.end >= endTime)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a variable is replicated (even-indexed)
   */
  // isReplicated(variableId: number) -> boolean
  isReplicated(variableId: number): boolean {
    return variableId % 2 === 0;
  }

  /**
   * Check if a site can read a variable
   */
  // canRead(siteId: number, variableId: number) -> boolean
  canRead(siteId: number, variableId: number): boolean {
    const site = this.sites.get(siteId);
    if (!site || site.state === "Failed") {
      return false;
    }

    if (!this.versionStore.hasVariable(siteId, variableId)) {
      return false;
    }

    // If replicated and site is recovering, check if reads are enabled
    if (this.isReplicated(variableId) && site.state === "Recovering") {
      return site.replicatedReadEnabled.get(variableId) ?? false;
    }

    return true;
  }

  /**
   * Get the site that holds a non-replicated variable
   */
  // getSiteForVariable(variableId: number) -> number
  getSiteForVariable(variableId: number): number {
    if (this.isReplicated(variableId)) {
      throw new Error(`Variable x${variableId} is replicated`);
    }
    return 1 + ((variableId - 1) % 10);
  }

  /**
   * Get all site IDs
   */
  // getAllSiteIds() -> number[]
  getAllSiteIds(): number[] {
    return Array.from(this.sites.keys());
  }

  /**
   * Get site state
   */
  // getSiteState(siteId: number) -> SiteState | null
  getSiteState(siteId: number): SiteState | null {
    const site = this.sites.get(siteId);
    return site ? site.state : null;
  }

  /**
   * Get all available sites
   */
  // getAvailableSites() -> number[]
  getAvailableSites(): number[] {
    return Array.from(this.sites.values())
      .filter((site) => site.state !== "Failed")
      .map((site) => site.id);
  }
}

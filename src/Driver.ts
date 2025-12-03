/**
 * Driver: Main orchestrator for the distributed transaction simulator
 */

import type { Command } from "./types.js";
import { Parser } from "./Parser.js";
import { TransactionManager } from "./TransactionManager.js";
import { ConcurrencyControl } from "./ConcurrencyControl.js";
import { ReplicationRouter } from "./ReplicationRouter.js";
import { VersionStore } from "./VersionStore.js";
import { SiteManager } from "./SiteManager.js";

export class Driver {
  private transactionManager: TransactionManager;
  private siteManager: SiteManager;
  private versionStore: VersionStore;
  private replicationRouter: ReplicationRouter;
  private concurrencyControl: ConcurrencyControl;

  constructor() {
    // Initialize all modules
    this.versionStore = new VersionStore();
    this.siteManager = new SiteManager(this.versionStore);
    this.replicationRouter = new ReplicationRouter(
      this.siteManager,
      this.versionStore
    );
    this.concurrencyControl = new ConcurrencyControl();
    this.transactionManager = new TransactionManager(
      this.concurrencyControl,
      this.replicationRouter,
      this.versionStore,
      this.siteManager
    );
  }

  /**
   * Execute a single command
   */
  // executeCommand(command: Command) -> void: dispatch parsed command to subsystem
  executeCommand(command: Command): void {
    switch (command.type) {
      case "begin":
        this.transactionManager.begin(command.transactionId);
        break;

      case "end":
        this.transactionManager.end(command.transactionId);
        break;

      case "read":
        this.transactionManager.read(command.transactionId, command.variable);
        break;

      case "write":
        this.transactionManager.write(
          command.transactionId,
          command.variable,
          command.value
        );
        break;

      case "fail":
        this.siteManager.fail(
          command.siteId,
          this.transactionManager.getCurrentTime()
        );
        this.transactionManager.handleSiteFailure(command.siteId);
        this.transactionManager.advanceTime();
        break;

      case "recover":
        this.siteManager.recover(
          command.siteId,
          this.transactionManager.getCurrentTime()
        );
        this.transactionManager.advanceTime();
        break;

      case "dump":
        this.transactionManager.dump();
        break;

      case "dumpVariable":
        this.transactionManager.dumpVariable(command.variable);
        break;

      case "dumpSite":
        this.transactionManager.dumpSite(command.siteId);
        break;
      case "reset":
        // Reinitialize all modules to restore initial simulator state
        this.versionStore = new VersionStore();
        this.siteManager = new SiteManager(this.versionStore);
        this.replicationRouter = new ReplicationRouter(
          this.siteManager,
          this.versionStore
        );
        this.concurrencyControl = new ConcurrencyControl();
        this.transactionManager = new TransactionManager(
          this.concurrencyControl,
          this.replicationRouter,
          this.versionStore,
          this.siteManager
        );
        break;
    }
  }

  /**
   * Execute multiple commands from input string
   */
  // run(input: string) -> void: parse and execute input, auto-dump if needed
  run(input: string): void {
    const commands = Parser.parseLines(input);

    for (const command of commands) {
      this.executeCommand(command);
    }

    // Automatically dump if no explicit dump command was given
    const hasDumpCommand = commands.some(
      (cmd) =>
        cmd.type === "dump" ||
        cmd.type === "dumpVariable" ||
        cmd.type === "dumpSite"
    );

    if (!hasDumpCommand) {
      this.transactionManager.dump();
    }
  }

  /**
   * Execute commands from an array
   */
  // runCommands(commands: Command[]) -> void: execute pre-parsed commands, auto-dump if needed
  runCommands(commands: Command[]): void {
    for (const command of commands) {
      this.executeCommand(command);
    }

    // Automatically dump if no explicit dump command was given
    const hasDumpCommand = commands.some(
      (cmd) =>
        cmd.type === "dump" ||
        cmd.type === "dumpVariable" ||
        cmd.type === "dumpSite"
    );

    if (!hasDumpCommand) {
      this.transactionManager.dump();
    }
  }
}

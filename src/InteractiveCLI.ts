/**
 * Interactive CLI for building and running test cases
 */

import * as readline from "readline";
import { Driver } from "./Driver.js";

export class InteractiveCLI {
  private commands: string[] = [];
  private rl: readline.Interface;
  private pasteMode: boolean = false;
  private pasteBuffer: string[] = [];

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Handle raw mode for ESC key detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
  }

  // printWelcome() -> void: display interactive usage guide
  private printWelcome(): void {
    console.log(
      "╔═══════════════════════════════════════════════════════════╗"
    );
    console.log("║   Distributed Transaction Simulator - Interactive Mode   ║");
    console.log(
      "╚═══════════════════════════════════════════════════════════╝"
    );
    console.log("");
    console.log("Enter commands line by line. Available commands:");
    console.log("  • begin(T)         - Start transaction T");
    console.log("  • end(T)           - Commit or abort transaction T");
    console.log("  • R(T, xi)         - Transaction T reads variable xi");
    console.log(
      "  • W(T, xi, v)      - Transaction T writes value v to variable xi"
    );
    console.log("  • fail(i)          - Site i fails");
    console.log("  • recover(i)       - Site i recovers");
    console.log("  • dump()           - Display all variables");
    console.log("  • dump(xi)         - Display variable xi");
    console.log("  • dump(i)          - Display all variables at site i");
    console.log("");
    console.log("Special commands:");
    console.log("  • clear            - Clear all entered commands");
    console.log("  • list             - Show all entered commands");
    console.log("  • save <filename>  - Save commands to a file");
    console.log("  • run              - Execute the commands");
    console.log("  • exit / quit      - Exit without running");
    console.log("");
    console.log("💡 You can paste multiple commands at once!");
    console.log(
      "Press ESC at any time to execute all commands and see results."
    );
    console.log("Press Ctrl+C to exit without running.");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    console.log("");
  }

  // printPrompt() -> void: show line number prompt
  private printPrompt(): void {
    process.stdout.write(`[${this.commands.length + 1}] > `);
  }

  // readCommand() -> Promise<string | string[]>: read one line or paste buffer, handles ESC/Ctrl+C
  private async readCommand(): Promise<string | string[]> {
    return new Promise((resolve) => {
      let buffer = "";
      let pasteTimeout: NodeJS.Timeout | null = null;
      let pasteLines: string[] = [];
      let isPasting = false;

      const onData = (key: Buffer) => {
        const char = key.toString();
        const byte = key[0]!;

        // Detect paste (multiple characters at once or newlines)
        if (char.includes("\n") || char.includes("\r")) {
          isPasting = true;
          const lines = char.split(/\r?\n/);

          // First line completes current buffer
          if (buffer.length > 0 || lines[0]!.trim().length > 0) {
            pasteLines.push(buffer + lines[0]);
            process.stdout.write(lines[0] + "\n");
          }

          // Middle lines
          for (let i = 1; i < lines.length - 1; i++) {
            if (lines[i]!.trim().length > 0) {
              pasteLines.push(lines[i]!);
              process.stdout.write(lines[i] + "\n");
            }
          }

          // Last line becomes new buffer
          buffer = lines[lines.length - 1]!;
          if (buffer.trim().length > 0 && lines.length > 1) {
            pasteLines.push(buffer);
            process.stdout.write(buffer + "\n");
            buffer = "";
          }

          // Set timeout to detect end of paste
          if (pasteTimeout) clearTimeout(pasteTimeout);
          pasteTimeout = setTimeout(() => {
            process.stdin.removeListener("data", onData);
            if (pasteLines.length > 0) {
              resolve(pasteLines);
            } else if (buffer.trim().length > 0) {
              resolve(buffer);
            } else {
              resolve("");
            }
          }, 50);
          return;
        }

        // ESC key (27)
        if (byte === 27) {
          if (pasteTimeout) clearTimeout(pasteTimeout);
          process.stdout.write("\n");
          process.stdin.removeListener("data", onData);
          resolve("__ESC__");
          return;
        }

        // Ctrl+C (3)
        if (byte === 3) {
          if (pasteTimeout) clearTimeout(pasteTimeout);
          process.stdout.write("\n");
          process.stdin.removeListener("data", onData);
          resolve("__EXIT__");
          return;
        }

        // Backspace (127 or 8)
        if (byte === 127 || byte === 8) {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            process.stdout.write("\b \b");
          }
          return;
        }

        // Enter (13 or 10) - single line
        if ((byte === 13 || byte === 10) && !isPasting) {
          process.stdout.write("\n");
          process.stdin.removeListener("data", onData);
          resolve(buffer);
          return;
        }

        // Regular character
        if (byte >= 32 && byte <= 126) {
          buffer += char;
          process.stdout.write(char);
        }
      };

      process.stdin.on("data", onData);
    });
  }

  // handleSpecialCommand(command: string) -> boolean: process clear/list/save/run/exit commands
  private handleSpecialCommand(command: string): boolean {
    const trimmed = command.trim();

    if (trimmed === "clear") {
      this.commands = [];
      console.log("✓ All commands cleared.");
      return true;
    }

    if (trimmed === "list") {
      if (this.commands.length === 0) {
        console.log("No commands entered yet.");
      } else {
        console.log("\nEntered commands:");
        this.commands.forEach((cmd, idx) => {
          console.log(`  ${idx + 1}. ${cmd}`);
        });
        console.log("");
      }
      return true;
    }

    if (trimmed.startsWith("save ")) {
      const filename = trimmed.substring(5).trim();
      this.saveToFile(filename);
      return true;
    }

    if (trimmed === "run") {
      return false; // Signal to run
    }

    if (trimmed === "exit" || trimmed === "quit") {
      console.log("Exiting without running commands.");
      process.exit(0);
    }

    return false;
  }

  // saveToFile(filename: string) -> void: write buffered commands to tests/<filename>.txt
  private saveToFile(filename: string): void {
    const fs = require("fs");
    const path = require("path");

    try {
      // Ensure filename has .txt extension
      if (!filename.endsWith(".txt")) {
        filename += ".txt";
      }

      // Add comments if any of the commands look like test structure
      const content = this.commands.join("\n") + "\n";

      // Try to save to tests directory first, fallback to current directory
      let filepath = path.join(process.cwd(), "tests", filename);

      fs.writeFileSync(filepath, content, "utf8");
      console.log(`✓ Commands saved to: ${filepath}`);
    } catch (error) {
      // Fallback to current directory
      try {
        const filepath = path.join(process.cwd(), filename);
        const fs = require("fs");
        fs.writeFileSync(filepath, this.commands.join("\n") + "\n", "utf8");
        console.log(`✓ Commands saved to: ${filepath}`);
      } catch (err) {
        console.error(`✗ Error saving file: ${err}`);
      }
    }
  }

  // runCommands() -> void: execute buffered commands through Driver
  private runCommands(): void {
    if (this.commands.length === 0) {
      console.log("No commands to run.");
      return;
    }

    console.log(
      "\n╔═══════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                    Executing Commands                     ║"
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════╝"
    );
    console.log("");

    const input = this.commands.join("\n");
    const driver = new Driver();

    try {
      driver.run(input);
    } catch (error) {
      console.error("\n✗ Error during execution:", error);
    }

    console.log(
      "\n─────────────────────────────────────────────────────────────"
    );
    console.log("Execution complete.");
  }

  // start() -> Promise<void>: main loop to collect and run commands
  public async start(): Promise<void> {
    this.printWelcome();

    while (true) {
      this.printPrompt();
      const result = await this.readCommand();

      // Handle multiple commands (paste)
      if (Array.isArray(result)) {
        let shouldRun = false;
        let shouldExit = false;

        for (const command of result) {
          const trimmed = command.trim();

          // Skip empty lines and comments
          if (
            trimmed === "" ||
            trimmed.startsWith("#") ||
            trimmed.startsWith("//")
          ) {
            continue;
          }

          // Check for special commands
          if (trimmed === "run") {
            shouldRun = true;
            break;
          }
          if (trimmed === "exit" || trimmed === "quit") {
            shouldExit = true;
            break;
          }
          if (this.handleSpecialCommand(trimmed)) {
            continue;
          }

          // Add regular command
          this.commands.push(trimmed);
        }

        if (shouldExit) {
          console.log("Exiting without running commands.");
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          this.rl.close();
          process.exit(0);
        }

        if (shouldRun) {
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          this.rl.close();
          this.runCommands();
          break;
        }

        console.log(
          `✓ Added ${
            result.filter((c) => c.trim() && !c.trim().startsWith("#")).length
          } commands`
        );
        continue;
      }

      // Handle single command
      const command = result as string;

      // Handle ESC
      if (command === "__ESC__") {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        this.rl.close();
        this.runCommands();
        break;
      }

      // Handle Ctrl+C / EXIT
      if (command === "__EXIT__") {
        console.log("Exiting without running commands.");
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        this.rl.close();
        process.exit(0);
      }

      // Skip empty lines
      if (command.trim() === "") {
        continue;
      }

      // Handle special commands
      if (this.handleSpecialCommand(command)) {
        continue;
      }

      // Check if it's "run" command
      if (command.trim() === "run") {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        this.rl.close();
        this.runCommands();
        break;
      }

      // Add regular command
      this.commands.push(command);
    }
  }
}

/**
 * Main entry point for the distributed transaction simulator
 */

import * as fs from "fs";
import * as path from "path";
import { Driver } from "./Driver.js";

function main() {
  const args = process.argv.slice(2);
  // Allow passing a CLI stopper (e.g., docker run IMAGE -- <file>)
  if (args[0] === "--") {
    args.shift();
  }

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Distributed Transaction Simulator");
    console.log("==================================");
    console.log("");
    console.log("Usage:");
    console.log("  node dist/index.js <input_file>");
    console.log("  node dist/index.js -              (reads from stdin)");
    console.log("");
    console.log("Examples:");
    console.log("  node dist/index.js tests/input1.txt");
    console.log("  cat tests/input1.txt | node dist/index.js -");
    console.log("");
    console.log("To run all tests:");
    console.log("  npm run test");
    console.log("  node scripts/run-tests.mjs");
    console.log("");
    console.log("To run a specific test:");
    console.log("  node scripts/run-tests.mjs --id=5");
    console.log("");
    console.log("Interactive mode (enter commands, press ESC to run):");
    console.log("  npm run input-test");
    process.exit(args.length === 0 ? 1 : 0);
  }

  const driver = new Driver();

  if (args[0] === "-") {
    // Read from stdin
    let input = "";
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (chunk) => {
      input += chunk;
    });

    process.stdin.on("end", () => {
      driver.run(input);
    });
  } else {
    // Read from file
    const inputFile = args[0]!;

    try {
      const input = fs.readFileSync(inputFile, "utf8");

      // If the file contains "// Test <num>" markers, split and run per section with headers
      const markerRegex = /^\s*\/\/\s*Test\s*(\d+(?:\.\d+)?)/i;
      const lines = input.split("\n");
      type Segment = { name: string | null; lines: string[] };
      const segments: Segment[] = [];
      let current: Segment = { name: null, lines: [] };

      for (const line of lines) {
        const m = line.match(markerRegex);
        if (m) {
          // flush previous segment
          if (current.lines.length > 0) {
            segments.push(current);
            current = { name: null, lines: [] };
          }
          // start new named segment; exclude marker line from commands
          current.name = m[1]!;
          continue;
        }
        current.lines.push(line);
      }
      if (current.lines.length > 0) {
        segments.push(current);
      }

      const hasMarkers = segments.some((s) => s.name !== null);
      if (hasMarkers) {
        for (const seg of segments) {
          if (seg.name) {
            console.log(`\n============== TEST ${seg.name} ===============\n`);
          }
          const segInput = seg.lines.join("\n") + "\n";
          // Run each segment with a fresh simulator state
          const segDriver = new Driver();
          segDriver.run(segInput);
        }
      } else {
        driver.run(input);
      }
    } catch (error) {
      console.error(`Error reading file ${inputFile}:`, error);
      process.exit(1);
    }
  }
}

main();

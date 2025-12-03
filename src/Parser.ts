/**
 * Parser: Parses input commands and dispatches them to the system
 */

import type { Command } from "./types.js";

export class Parser {
  /**
   * Parse a single line of input into a command
   */
  // parseLine(line: string) -> Command | null: parse one directive string to Command
  static parseLine(line: string): Command | null {
    // Remove comments and trim
    const commentIndex = line.indexOf("//");
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex);
    }
    line = line.trim();

    // Skip empty lines
    if (line.length === 0) {
      return null;
    }

    // Match different command patterns
    // begin(T1)
    let match = line.match(/^begin\(([^)]+)\)$/);
    if (match) {
      return { type: "begin", transactionId: match[1]! };
    }

    // end(T1)
    match = line.match(/^end\(([^)]+)\)$/);
    if (match) {
      return { type: "end", transactionId: match[1]! };
    }

    // R(T1, x3)
    match = line.match(/^R\(([^,]+),\s*x(\d+)\)$/);
    if (match) {
      return {
        type: "read",
        transactionId: match[1]!,
        variable: parseInt(match[2]!, 10),
      };
    }

    // W(T1, x3, 100)
    match = line.match(/^W\(([^,]+),\s*x(\d+),\s*(-?\d+)\)$/);
    if (match) {
      return {
        type: "write",
        transactionId: match[1]!,
        variable: parseInt(match[2]!, 10),
        value: parseInt(match[3]!, 10),
      };
    }

    // fail(3)
    match = line.match(/^fail\((\d+)\)$/);
    if (match) {
      return { type: "fail", siteId: parseInt(match[1]!, 10) };
    }

    // recover(3)
    match = line.match(/^recover\((\d+)\)$/);
    if (match) {
      return { type: "recover", siteId: parseInt(match[1]!, 10) };
    }

    // dump()
    if (line === "dump()") {
      return { type: "dump" };
    }

    // reset()
    if (line === "reset()") {
      return { type: "reset" };
    }

    // dump(x3)
    match = line.match(/^dump\(x(\d+)\)$/);
    if (match) {
      return { type: "dumpVariable", variable: parseInt(match[1]!, 10) };
    }

    // dump(3)
    match = line.match(/^dump\((\d+)\)$/);
    if (match) {
      return { type: "dumpSite", siteId: parseInt(match[1]!, 10) };
    }

    console.log(`Warning: Could not parse line: ${line}`);
    return null;
  }

  /**
   * Parse multiple lines of input
   */
  // parseLines(input: string) -> Command[]: split input and parse to command list
  static parseLines(input: string): Command[] {
    const lines = input.split("\n");
    const commands: Command[] = [];

    for (const line of lines) {
      const command = Parser.parseLine(line);
      if (command) {
        commands.push(command);
      }
    }

    return commands;
  }
}

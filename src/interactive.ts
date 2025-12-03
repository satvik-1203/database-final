/**
 * Entry point for interactive CLI mode
 */

import { InteractiveCLI } from "./InteractiveCLI.js";

async function main() {
  const cli = new InteractiveCLI();
  await cli.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


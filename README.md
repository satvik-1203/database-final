# Distributed Transaction Simulator

A single-process simulator modeling a distributed, replicated data store across multiple sites, implementing snapshot isolation with serializability guarantees.

## Team

- **Satvik Seeram** (vs3301@nyu.edu)
- **Mahitha Bushap** (mb6751@nyu.edu)

## Overview

This TypeScript implementation simulates a distributed database system with:

- **10 sites** (labeled 1-10)
- **20 variables** (x1-x20)
- **Snapshot isolation** with serializability enforcement
- **Site failures and recovery**
- **Replication** for even-indexed variables

## Features

- ✅ Snapshot isolation for transactions
- ✅ First-committer-wins conflict resolution
- ✅ Serialization cycle detection
- ✅ Site failure and recovery handling
- ✅ Replicated variable management
- ✅ Available copies algorithm
- ✅ Read-only optimization for replicated variables

## Data Model

### Variables

- **Initial values**: x1=10, x2=20, x3=30, ..., x20=200
- **Replication**:
  - Even-indexed variables (x2, x4, ..., x20) are replicated at all sites
  - Odd-indexed variables (x1, x3, ..., x19) reside at a single site: `1 + ((i-1) mod 10)`

### Sites

- Each site maintains committed versions (timestamp, value) per variable
- Site states: `Up`, `Failed`, `Recovering`
- Recovering sites cannot serve reads of replicated variables until a new write occurs

## Architecture

```
┌─────────────────┐
│  Parser/Driver  │
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
┌───▼────────────────┐
│ Transaction Manager│
└───┬────────────┬───┘
    │            │
┌───▼──────┐ ┌──▼────────────┐
│Concurrency│ │  Replication  │
│ Control   │ │    Router     │
└───┬───────┘ └──┬────────────┘
    │            │
┌───▼────────┐ ┌─▼────────┐
│Version Store│ │   Site    │
└─────────────┘ │  Manager  │
                └───────────┘
```

## Modules

### 1. Parser/Driver

Parses input directives and dispatches commands to the system.

### 2. Transaction Manager

Manages transaction lifecycle, timestamps, read/write sets, and commit/abort decisions.

### 3. Concurrency Control

Enforces snapshot isolation and serializability using:

- First-committer-wins (FCW) rule
- Serialization graph with cycle detection

### 4. Version Store

Stores committed versions per site per variable and answers snapshot queries.

### 5. Site Manager

Tracks site states, uptime intervals, and read-enabled flags for replicated variables.

### 6. Replication Router

Chooses appropriate sites for reads and writes based on availability and replication rules.

## Installation

### Local Installation

```bash
# Install dependencies
npm install
# or
pnpm install

# Build the project
npm run build
```

### Docker Installation

```bash
# Build the Docker image
docker build -t distributed-transaction-simulator .

# Or use Docker Compose
docker-compose build
```

See [DOCKER.md](DOCKER.md) for detailed Docker usage instructions.

## Usage

### Local Usage

#### Run with input file

```bash
npm start tests/input1.txt
```

#### Run specific test

```bash
npm test -- --id=1  # Run test case 1
npm test -- --id=5  # Run test case 5
npm test -- --id=15 # Run test case 15
```

#### Run all tests

```bash
npm test
```

#### Interactive mode (type or paste commands)

```bash
npm run input-test
```

Type commands one by one **OR paste multiple commands at once**, then press **ESC** to execute.  
✨ Perfect for quick testing and experimentation!  
See [INTERACTIVE_MODE.md](INTERACTIVE_MODE.md) for details or [PASTE_EXAMPLE.md](PASTE_EXAMPLE.md) for quick examples.

### Docker Usage

#### Run with Docker

```bash
# Run a specific test
docker run --rm distributed-transaction-simulator tests/input1.txt

# Run all tests
docker run --rm --entrypoint node distributed-transaction-simulator scripts/run-tests.mjs

# Run a specific test by ID
docker run --rm --entrypoint node distributed-transaction-simulator scripts/run-tests.mjs --id=5
```

#### Run with Docker Compose

```bash
# Run a specific test
docker-compose run --rm db-simulator tests/input1.txt

# Run all tests
docker-compose run --rm test-runner

# Run a specific test by ID
docker-compose run --rm test-runner --id=10
```

See [DOCKER.md](DOCKER.md) for more Docker examples and options.

## Input Commands

- `begin(T)` - Start transaction T
- `end(T)` - Commit or abort transaction T
- `R(T, xi)` - Transaction T reads variable xi
- `W(T, xi, v)` - Transaction T writes value v to variable xi
- `fail(i)` - Site i fails
- `recover(i)` - Site i recovers
- `dump()` - Display all variables across all sites
- `dump(xi)` - Display variable xi at all sites that have it
- `dump(i)` - Display all variables at site i

## Example

```
begin(T1)
begin(T2)
W(T1,x1,101)
W(T2,x2,202)
end(T1)
end(T2)
dump()
```

## Output Format

### Reads

```
T1: R(x1) -> 10
```

### Commits

```
T1 commits
```

### Aborts

```
T2 aborts (first-committer-wins conflict on x1 with T1)
```

### Dumps

```
x1: 101 at site 2
x2: 202 at all sites
```

## Concurrency Control

### Snapshot Isolation

- Each transaction receives a begin timestamp
- Reads return the latest committed version ≤ begin timestamp
- Writes are buffered until commit

### Serializability

- **First-Committer-Wins**: Earlier writers take precedence
- **Cycle Detection**: Serialization graph prevents cycles via:
  - WW edges (write-write dependencies)
  - RW edges (read-write dependencies)

### Failure Handling

- `fail(site)`: Site becomes Failed, cannot serve requests
- `recover(site)`: Site becomes Recovering
  - Replicated variables are read-disabled until new writes
  - Non-replicated variables may be readable immediately
- Transactions abort if they accessed a site that later failed

### Availability

- Reads only use sites that were continuously up from version commit time to transaction begin time
- Transactions abort if no eligible site is available

## Test Cases

The simulator includes 27 comprehensive test cases:

1. **input1.txt**: Write-write conflict (T1 aborts, T2 commits)
2. **input2.txt**: Serializable snapshot isolation with reads and writes
3. **input3.txt**: Site failure handling with x8 replication
4. **input4.txt**: T2 aborts due to site failure
5. **input5.txt**: T2 aborts, site recovery before end
6. **input6.txt**: T1 aborts due to accessed site failure
7. **input7.txt**: T1 fails after writing to failed site
8. **input8.txt**: Reading from recovering sites
9. **input9.txt**: Multiversion read consistency
10. **input10.txt**: T2 reads initial, T3 reads T1's write
11. **input11.txt**: Snapshot isolation with original values
12. **input12.txt**: Read committed value after commit
13. **input13.txt**: All transactions commit
14. **input14.txt**: Both commit
15. **input15.txt**: Only T3 commits (first-committer-wins)
16. **input16.txt**: Only T1 commits
17. **input17.txt**: Multiple aborts with site failure
18. **input18.txt**: Read after commit
19. **input19.txt**: Abort due to site failure losing access info
20. **input20.txt**: Circular RW conflict (T5 aborts)
21. **input21.txt**: Almost circular with failures
22. **input22.txt**: T2 aborts, T1 succeeds
23. **input23.txt**: Simple R-W cycle
24. **input24.txt**: Three-transaction cycle
25. **input25.txt**: Read when no site continuously up
26. **input26.txt**: Similar to Test 25
27. **input27.txt**: Wait for site recovery

## Project Structure

```
.
├── src/
│   ├── types.ts              # Core type definitions
│   ├── VersionStore.ts       # Version management
│   ├── SiteManager.ts        # Site state tracking
│   ├── ReplicationRouter.ts  # Site selection logic
│   ├── ConcurrencyControl.ts # Serializability enforcement
│   ├── TransactionManager.ts # Transaction coordination
│   ├── Parser.ts             # Command parsing
│   ├── Driver.ts             # Main orchestrator
│   └── index.ts              # Entry point
├── tests/
│   ├── input1.txt - input27.txt  # Test cases
├── scripts/
│   └── run-tests.mjs         # Test runner
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Docker Compose configuration
├── .dockerignore             # Docker ignore file
├── package.json
├── tsconfig.json
└── README.md
```

## Design Principles

1. **Immutable versions**: Only committed data is visible to readers
2. **Logical timestamps**: Monotonic time advances on begins, commits, failures, recoveries
3. **Single-process**: No multi-threading required, concurrency modeled via timestamps
4. **Available copies**: Reads use any available site with required data
5. **Strict serializability**: Validation at commit time ensures correctness

## References

- NYU CSCI-GA.2434-001 Advanced Database Systems
- Based on design by Satvik Seeram and Mahitha Bushap
- Implements concepts from distributed databases and transaction processing

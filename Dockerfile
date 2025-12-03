# Use Node.js LTS version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and configuration
COPY tsconfig.json ./
COPY src/ ./src/
COPY tests/ ./tests/
COPY scripts/ ./scripts/

# Build the TypeScript project
RUN pnpm run build

# Set the entrypoint to run the simulator
ENTRYPOINT ["node", "dist/index.js"]

# Default command shows usage
CMD ["--help"]


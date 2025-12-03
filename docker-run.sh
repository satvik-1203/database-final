#!/bin/bash

# Quick Docker run script for Distributed Transaction Simulator
# Makes it easier to run the simulator without remembering Docker commands

set -e

IMAGE_NAME="distributed-transaction-simulator"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Function to build the image
build_image() {
    print_info "Building Docker image..."
    docker build -t "$IMAGE_NAME" .
    print_info "Build complete!"
}

# Function to check if image exists
check_image() {
    if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
        print_warning "Image not found. Building now..."
        build_image
    fi
}

# Main logic
case "${1:-}" in
    build)
        build_image
        ;;
    test)
        check_image
        if [ -n "${2:-}" ]; then
            print_info "Running test ${2}..."
            docker run --rm "$IMAGE_NAME" "tests/input${2}.txt"
        else
            print_info "Running all tests..."
            docker run --rm --entrypoint node "$IMAGE_NAME" scripts/run-tests.mjs
        fi
        ;;
    run)
        check_image
        if [ -z "${2:-}" ]; then
            print_error "Please provide an input file."
            echo "Usage: $0 run <input_file>"
            exit 1
        fi
        print_info "Running with file: ${2}..."
        docker run --rm "$IMAGE_NAME" "$2"
        ;;
    shell)
        check_image
        print_info "Starting interactive shell..."
        docker run -it --rm --entrypoint /bin/sh "$IMAGE_NAME"
        ;;
    clean)
        print_info "Removing Docker image..."
        docker rmi "$IMAGE_NAME" 2>/dev/null || print_warning "Image not found"
        print_info "Clean complete!"
        ;;
    help|--help|-h|"")
        cat << EOF
Distributed Transaction Simulator - Docker Runner

Usage: $0 <command> [options]

Commands:
    build               Build the Docker image
    test [ID]           Run tests (all tests if no ID provided)
    run <file>          Run with a specific input file
    shell               Start an interactive shell in the container
    clean               Remove the Docker image
    help                Show this help message

Examples:
    $0 build                           # Build the image
    $0 test                            # Run all tests
    $0 test 5                          # Run test 5 (input5.txt)
    $0 run tests/input1.txt            # Run with input1.txt
    $0 run custom-inputs/mytest.txt    # Run with custom file
    $0 shell                           # Interactive shell
    $0 clean                           # Remove image

For more information, see DOCKER.md
EOF
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac


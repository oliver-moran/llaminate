#!/bin/bash

# Remove development files not to be packed or published.
echo "Removing development files not to be packed or published."
rm .env
rm tests/jest.config.json
rm tests/scratch.*

# Build the package.
echo "Building the package."
npm run build
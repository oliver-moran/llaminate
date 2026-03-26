#!/bin/bash

# Prepring documentation directories
echo "Preparing documentation directories."
rm -rf ./tmp
rm -rf ./docs

# Compile TypeScript
echo "Compiling TypeScript files."
tsc --project tsconfig.json --outDir tmp --sourceMap false --module preserve --declaration false --strict false

# Generate documentation using JSDoc
echo "Generating documentation with JSDoc."
jsdoc --readme README.md -c jsdoc.json && rm -rf ./tmp

# Customize documentation HTML files (a hack, yes, but effective)
echo "Customizing documentation."
find ./docs -type f -name "*.html" -exec sed -i '' 's/<h2><a href="index.html">Home<\/a><\/h2>/<h4><a href="index.html">README.md<\/a><\/h4>/g' {} +
find ./docs -type f -name "*.html" -exec sed -i '' 's/Home/Llaminate/g' {} +
find ./docs -type f -name "*.html" -exec sed -i '' 's/JSDoc: Llaminate/Llaminate - A simple but powerful library for interacting with large language models (LLMs)/g' {} +
find ./docs -type f -name "*.html" -exec sed -i '' 's/JSDoc//g' {} +

# Copy additional files to the docs directory
# JSDoc doesn't handle this gracefully enough, so we do it manually.
echo "Copying additional files to the docs."
cp LICENSE ./docs
mkdir -p ./docs/assets
cp ./assets/llaminate-256.webp ./docs/assets
#!/bin/bash

# Compile TypeScript
echo "Compiling TypeScript files."
tsc

# Minify JavaScript files
echo "Minifying JavaScript files:"
for file in dist/*.js; do
  echo "  - $file"
  terser "$file" -o "${file%.js}.min.js" --source-map --comments 'some'
done

# Remove original JavaScript files
echo "Removing non-minified files."
find dist -type f \( -name '*.min.js' \) -prune -o -name '*.js' -exec rm {} +
find dist -type f \( -name '*.min.js.map' \) -prune -o -name '*.js.map' -exec rm {} +
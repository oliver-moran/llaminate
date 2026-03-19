#!/bin/bash

# Compile TypeScript
tsc

# Minify JavaScript files
for file in dist/*.js; do
  terser "$file" -o "${file%.js}.min.js" --source-map --comments 'some'
done

# Remove original JavaScript files
find dist -type f \( -name '*.min.js' \) -prune -o -name '*.js' -exec rm {} +
find dist -type f \( -name '*.min.js.map' \) -prune -o -name '*.js.map' -exec rm {} +
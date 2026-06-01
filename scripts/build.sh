#!/bin/bash

# Compile TypeScript
echo "Compiling TypeScript files."
tsc

# Minify JavaScript files
echo "Minifying JavaScript files:"
find dist -type f -name '*.js' ! -name '*.min.js' -print0 | while IFS= read -r -d '' file; do
  echo "  - $file"
  name="$(basename "$file" .js)" # Sourcemap URL should be relative to the output file.
  terser "$file" -o "${file%.js}.min.js" --source-map "url='${name}.min.js.map'" --comments 'some'
done

# Remove original JavaScript files
echo "Removing non-minified files."
find dist -type f \( -name '*.min.js' \) -prune -o -name '*.js' -exec rm {} +
find dist -type f \( -name '*.min.js.map' \) -prune -o -name '*.js.map' -exec rm {} +

# Building documentation
echo "Building documentation."
npm run docs
#!/bin/bash

# Compile TypeScript
echo "Compiling TypeScript files."
tsc

# Minify JavaScript files
echo "Minifying JavaScript files:"
for file in dist/*.js; do
  echo "  - $file"
  name="$(basename "$file" .js)" # Extract the file name without the .js extension and without the path
  terser "$file" -o "${file%.js}.min.js" --source-map "url='${name}.min.js.map'" --comments 'some'
done

# Remove original JavaScript files
echo "Removing non-minified files."
find dist -type f \( -name '*.min.js' \) -prune -o -name '*.js' -exec rm {} +
find dist -type f \( -name '*.min.js.map' \) -prune -o -name '*.js.map' -exec rm {} +

# Renaming TypeScript declaration files
echo "Renaming TypeScript declaration files."
for file in dist/*.d.ts; do
  echo "  - $file"
  name="$(basename "$file" .d.ts)" # Extract the file name without the .d.ts extension and without the path
  mv "$file" "dist/${name}.min.d.ts"
done

# Building documentation
echo "Building documentation."
npm run docs
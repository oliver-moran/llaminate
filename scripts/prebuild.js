const fs = require('fs');
const path = require('path');

// Define source and destination paths, package information, and files to copy

const src = path.join(__dirname, "../src");
const dist = path.join(__dirname, "../dist");

const package = require("../package.json");
const files = ["config.schema.json"];

// Ensure the dist directory exists

console.log('Preparing the dist directory.');

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
}
fs.mkdirSync(dist);

// Generate build-info.json

console.log("Generating build-info.json.");

const build = {
  name: package.name,
  version: package.version,
  date: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(dist, "build-info.json"),
  JSON.stringify(build, null, 2)
);

// Copy config.schema.json to dist directory

console.log("Copying files to dist directory:");

files.forEach(file => {
  fs.copyFileSync(path.join(src, file), path.join(dist, file));
  console.log(`  - ${file}`);
});
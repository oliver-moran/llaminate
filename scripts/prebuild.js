const fs = require('fs');
const path = require('path');

// Define source and destination paths, package information, and files to copy

const src = path.join(__dirname, "../src");
const dist = path.join(__dirname, "../dist");

const package = require("../package.json");
const files = ["config.schema.json"];

// Ensure the dist directory exists

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
  console.log('Cleared the dist directory.');
}
fs.mkdirSync(dist);

// Generate build-info.json

const build = {
  name: package.name,
  version: package.version,
  date: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(dist, "build-info.json"),
  JSON.stringify(build, null, 2)
);

console.log("Generated build-info.json:\n", build);

// Copy config.schema.json to dist directory

console.log("Copying files to dist directory:");

files.forEach(file => {
  fs.copyFileSync(path.join(src, file), path.join(dist, file));
  console.log(`  - ${file} copied successfully`);
});
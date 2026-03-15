const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../package.json');
const distPath = path.resolve(__dirname, '../dist');

// Ensure the dist directory exists
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('Cleared the dist directory.');
}
fs.mkdirSync(distPath);

const packageJson = require(packageJsonPath);
const version = packageJson.version;

console.log(`Using version: ${version} for build output.`);
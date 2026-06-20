import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function main() {
  const newVersion = process.argv[2];
  if (!newVersion) {
    console.error("Usage: node scripts/bump-version.mjs <version>");
    console.error("Example: node scripts/bump-version.mjs 0.2.0");
    process.exit(1);
  }

  if (!/^\d+\.\d+\.\d+(-[a-z0-9]+)?$/.test(newVersion)) {
    console.error("Version must be semver (e.g. 0.2.0 or 0.2.0-rc1)");
    process.exit(1);
  }

  bumpPackageJson(root, newVersion);
  bumpTauriConf(root, newVersion);
  bumpCargoToml(root, newVersion);
  bumpVersionJson(root, newVersion);

  console.log(`Version bumped to ${newVersion} in all files.`);
}

function bumpPackageJson(root, version) {
  const path = resolve(root, "package.json");
  const json = JSON.parse(readFileSync(path, "utf-8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ✓ package.json → ${version}`);
}

function bumpTauriConf(root, version) {
  const path = resolve(root, "src-tauri", "tauri.conf.json");
  const json = JSON.parse(readFileSync(path, "utf-8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ✓ src-tauri/tauri.conf.json → ${version}`);
}

function bumpCargoToml(root, version) {
  const path = resolve(root, "src-tauri", "Cargo.toml");
  const content = readFileSync(path, "utf-8");
  const bumped = content.replace(
    /^version = ".*"/m,
    `version = "${version}"`
  );
  writeFileSync(path, bumped);
  console.log(`  ✓ src-tauri/Cargo.toml → ${version}`);
}

function bumpVersionJson(root, version) {
  const path = resolve(root, "version.json");
  writeFileSync(path, JSON.stringify({ version }, null, 2) + "\n");
  console.log(`  ✓ version.json → ${version}`);
}

main();

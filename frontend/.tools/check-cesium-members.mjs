// Audits every `cesium.<Member>` / `Cesium.<Member>` reference in src/ against the
// shipped Cesium 1.126.0 type definitions.
//
// This exists because two members were invented rather than checked
// (`Clock.deltaTime`, `ImagerySplitDirection`) and both failed silently at
// runtime. Anything with count 0 below does not exist in the pinned runtime.
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DTS_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.126.0/Source/Cesium.d.ts';
const dts = await fetch(DTS_URL).then((r) => r.text());

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

const files = await walk('src');
const used = new Map(); // member -> Set(files)

function record(member, file) {
  if (!member) return;
  if (!used.has(member)) used.set(member, new Set());
  used.get(member).add(file);
}

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  // Direct access: `cesium.Cartesian3`, `Cesium.Viewer`.
  for (const match of text.matchAll(/\b[Cc]esium\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    record(match[1], rel);
  }

  // Destructuring out of the namespace: `const { CameraEventType } = cesium;`
  // Without this arm the audit silently misses members — and it did, which is
  // why the check exists in the first place.
  for (const match of text.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*[Cc]esium\b/g)) {
    for (const part of match[1].split(',')) {
      // In `CameraEventType: Alias` the namespace member is the left-hand name.
      const name = part.trim().split(':')[0]?.trim();
      if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) record(name, rel);
    }
  }
}

const members = [...used.keys()].sort();
console.log(`checked ${members.length} Cesium members across ${files.length} files\n`);

let missing = 0;
for (const member of members) {
  const count = dts.split(member).length - 1;
  const where = [...used.get(member)].join(', ');
  if (count === 0) {
    missing += 1;
    console.log(`  MISSING  ${member.padEnd(26)} ${where}`);
  } else {
    console.log(`  ok       ${member.padEnd(26)} ${String(count).padStart(5)}  ${where}`);
  }
}

console.log(
  missing ? `\n${missing} member(s) DO NOT EXIST in Cesium 1.126.0` : '\nall members exist',
);

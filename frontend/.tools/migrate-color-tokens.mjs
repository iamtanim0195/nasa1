// One-shot migration: hardcoded white/black utilities -> theme-aware tokens.
//
//   bg-white/N      -> bg-elevate/N        (raised / hover tint, inverts)
//   border-white/N  -> border-hairline/N   (borders and dividers, inverts)
//   ring-white/N    -> ring-hairline/N
//   divide-white/N  -> divide-hairline/N
//   via-white/N     -> via-elevate/N
//   bg-black/20|25|30 -> bg-sunken         (inset wells; alpha baked per theme)
//
// The whole point: `bg-white/6` is invisible in light mode, `bg-elevate/6` is not.
// Run with --write to apply; without it, this only reports.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const WRITE = process.argv.includes('--write');

const RULES = [
  [/\bbg-white\//g, 'bg-elevate/'],
  [/\bborder-white\//g, 'border-hairline/'],
  [/\bring-white\//g, 'ring-hairline/'],
  [/\bdivide-white\//g, 'divide-hairline/'],
  [/\bvia-white\//g, 'via-elevate/'],
  [/\bfrom-white\//g, 'from-elevate/'],
  [/\bbg-black\/(20|25|30)\b/g, 'bg-sunken'],
];

// Anything left that still hardcodes a neutral, reported so it can be reviewed.
const LEFTOVER =
  /\b(?:bg|border|ring|divide|from|via|to|text|fill|stroke|shadow|outline|decoration|placeholder)-(?:white|black)\b[^\s"'`]*/g;

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

const files = await walk('src');
let changedFiles = 0;
let changedRules = 0;
const leftovers = new Map();

for (const file of files) {
  const original = await readFile(file, 'utf8');
  let text = original;
  let hits = 0;

  for (const [pattern, replacement] of RULES) {
    const matches = text.match(pattern);
    if (matches) {
      hits += matches.length;
      text = text.replace(pattern, replacement);
    }
  }

  for (const match of text.matchAll(LEFTOVER)) {
    leftovers.set(match[0], (leftovers.get(match[0]) ?? 0) + 1);
  }

  if (hits > 0) {
    changedFiles += 1;
    changedRules += hits;
    if (WRITE) await writeFile(file, text, 'utf8');
  }
}

console.log(
  `${WRITE ? 'APPLIED' : 'DRY RUN'} — ${changedRules} replacements in ${changedFiles} files\n`,
);

if (leftovers.size > 0) {
  console.log('remaining neutral-colour utilities to review:');
  for (const [token, count] of [...leftovers].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${token}`);
  }
} else {
  console.log('no hardcoded neutral utilities remain');
}

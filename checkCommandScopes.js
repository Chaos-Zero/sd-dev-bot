#!/usr/bin/env node
/**
 * Catches the load-time crash that `node --check` cannot see.
 *
 * Commands pull shared code in two different ways: `eval(fs.readFileSync(...))`
 * and `require`. An eval'd file's function and var declarations land in the
 * calling module's scope, so importing a name that the eval chain also declares
 * is a redeclaration -- and a redeclaration against a `const` is a SyntaxError
 * thrown when the command is loaded, not when it runs. The bot then fails to
 * start with something like:
 *
 *   SyntaxError: Identifier 'matchEntrantList' has already been declared
 *
 * Every file parses fine on its own, which is why this needs its own check.
 *
 *   node checkCommandScopes.js
 */

const fs = require("fs");
const path = require("path");

const EVAL = /eval\(\s*fs\.readFileSync\(\s*"\.\/([^"]+)"/g;

/**
 * Names a file leaks outward when eval'd: top-level functions and vars.
 *
 * Anchored to column zero deliberately. A `var` inside a function body belongs
 * to that function and never reaches the caller's scope -- counting those
 * flagged sd-tracks.js for a `var csv` buried in a match handler.
 */
function leakedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(
    /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm
  )) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^var\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  return names;
}

function walkEvalChain(file, found, seen) {
  if (seen.has(file) || !fs.existsSync(file)) return found;
  seen.add(file);
  const source = fs.readFileSync(file, "utf8");
  for (const name of leakedNames(source)) {
    found.set(name, (found.get(name) || []).concat(file));
  }
  for (const m of source.matchAll(EVAL)) walkEvalChain(m[1], found, seen);
  return found;
}

/** Top-level const/let bindings, including destructured requires. */
function lexicalNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(
    /^(?:const|let)\s*\{([\s\S]*?)\}\s*=\s*require/gm
  )) {
    for (const part of m[1].split(",")) {
      // "a: b" binds b, so the alias is what matters
      const name = part.split(":").pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function commandFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...commandFiles(full));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

let clashes = 0;
let checked = 0;
for (const file of commandFiles("public/commands")) {
  const source = fs.readFileSync(file, "utf8");
  const found = new Map();
  const seen = new Set();
  for (const m of source.matchAll(EVAL)) walkEvalChain(m[1], found, seen);
  checked += 1;

  for (const name of lexicalNames(source)) {
    if (!found.has(name)) continue;
    clashes += 1;
    console.log(
      `${file}\n    "${name}" is imported here but also declared by ${found
        .get(name)
        .join(", ")}`
    );
  }
}

console.log(
  clashes
    ? `\n${clashes} redeclaration(s) -- these crash the bot at load.`
    : `${checked} command files checked, no eval/require name collisions.`
);
process.exit(clashes ? 1 : 0);

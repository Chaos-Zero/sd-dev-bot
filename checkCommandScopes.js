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
 * It also reports the opposite mistake: calling something that nothing in the
 * file or its eval chain defines. `node --check` cannot see that either -- a
 * deleted helper still parses -- and it surfaces as a ReferenceError only when
 * a member runs the command.
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

/**
 * Blank out comments and string literals so a scan for calls does not trip over
 * prose. "...its run (" reads as a call to `run` otherwise.
 */
function stripLiterals(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** Everything a file can legally name: its own bindings plus its eval chain. */
function visibleNames(file, source) {
  const names = new Set(BUILT_INS);
  const collect = (text) => {
    for (const m of text.matchAll(
      /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g
    )) {
      names.add(m[1]);
    }
    for (const m of text.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g
    )) {
      names.add(m[1]);
    }
    for (const m of text.matchAll(/(?:const|let|var)\s*\{([\s\S]*?)\}\s*=/g)) {
      for (const part of m[1].split(",")) {
        const name = part.split(":").pop().trim();
        if (name) names.add(name);
      }
    }
    // parameters, so a callback argument is not reported as undefined
    for (const m of text.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/[\s=]/)[0];
        if (name) names.add(name);
      }
    }
  };

  collect(source);
  const seen = new Set();
  const chain = new Map();
  for (const m of source.matchAll(EVAL)) walkEvalChain(m[1], chain, seen);
  for (const evaluated of seen) {
    if (fs.existsSync(evaluated)) collect(fs.readFileSync(evaluated, "utf8"));
  }
  return names;
}

const BUILT_INS = [
  "require", "eval", "parseInt", "parseFloat", "Number", "String", "Boolean",
  "Array", "Object", "Set", "Map", "JSON", "Math", "Date", "Promise", "console",
  "isNaN", "isFinite", "Error", "Symbol", "BigInt", "RegExp", "setTimeout",
  "clearTimeout", "setInterval", "decodeURIComponent", "encodeURIComponent",
  "fetch", "structuredClone", "Buffer", "process", "URL", "Intl",
  "execute", "autocomplete", "then", "catch", "finally", "resolve", "reject",
  "if", "for", "while", "switch", "return", "function", "typeof", "of", "in",
  "await", "new", "async", "delete", "throw",
];

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
let missing = 0;
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

  // and the reverse: a call to something nothing defines
  const visible = visibleNames(file, source);
  const called = new Set();
  for (const m of stripLiterals(source).matchAll(
    /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g
  )) {
    if (!visible.has(m[1])) called.add(m[1]);
  }
  for (const name of called) {
    missing += 1;
    console.log(`${file}\n    "${name}" is called but nothing defines it`);
  }
}

if (clashes || missing) {
  console.log(
    `\n${clashes} redeclaration(s) and ${missing} undefined call(s) across ${checked} files.`
  );
} else {
  console.log(
    `${checked} command files checked: no name collisions, no undefined calls.`
  );
}
process.exit(clashes || missing ? 1 : 0);

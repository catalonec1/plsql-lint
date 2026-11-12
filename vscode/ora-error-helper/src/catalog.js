'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'https://catalonec1.github.io/Gr-dina-de-stele/ora/';
const CODE_RE = /\b(ORA|PLS|TNS)[-_ ]?(\d{1,5})\b/gi;

function load(file = path.join(__dirname, '..', 'data', 'errors.tsv')) {
  const map = new Map();
  for (const row of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!row.trim()) continue;
    const [code, , title, cause, action] = row.split('\t');
    map.set(code, { code, title, cause, action, url: `${BASE}${code}/` });
  }
  return map;
}

const normalize = (prefix, digits) => `${prefix.toUpperCase()}-${digits.padStart(5, '0')}`;

/** All error codes in text: [{code, index, length}] */
function scan(text) {
  const out = [];
  for (const m of text.matchAll(CODE_RE)) out.push({ code: normalize(m[1], m[2]), index: m.index, length: m[0].length });
  return out;
}

function markdown(e) {
  return `**${e.code}: ${e.title}**\n\n**Cause.** ${e.cause}\n\n**Fix.** ${e.action}\n\n[Open ${e.code} in the ORA error reference](${e.url})`;
}

module.exports = { load, scan, normalize, markdown, BASE };

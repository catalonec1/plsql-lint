'use strict';
// Pure-JS port of plsql-lint (Python) rules PLL001-PLL015. No VS Code dependency.

const K = { WORD: 'word', QUOTED: 'quoted', STRING: 'string', NUMBER: 'number', SYMBOL: 'symbol', COMMENT: 'comment' };
const Q_CLOSERS = { '[': ']', '{': '}', '(': ')', '<': '>' };
const TWO = new Set(['||', ':=', '=>', '<>', '!=', '^=', '~=', '<=', '>=', '..', '**', '<<', '>>']);

function tok(kind, text, line, col) {
  return { kind, text, line, col, norm: kind === K.WORD ? text.toUpperCase() : text };
}
function isWord(t, ...words) { return !!t && t.kind === K.WORD && words.includes(t.norm); }
const isAlpha = c => /\p{L}/u.test(c);
const isDigit = c => c >= '0' && c <= '9';
const isAlnum = c => /[\p{L}\p{N}]/u.test(c);

function tokenize(src) {
  const out = [];
  let i = 0, line = 1, ls = 0;
  const n = src.length;
  const adv = (s, e) => {
    const chunk = src.slice(s, e);
    const c = chunk.split('\n').length - 1;
    if (c) { line += c; ls = s + chunk.lastIndexOf('\n') + 1; }
  };
  while (i < n) {
    const ch = src[i];
    const tl = line, tc = i - ls + 1;
    if (ch === '\n') { line++; i++; ls = i; continue; }
    if (' \t\r\f\v'.includes(ch)) { i++; continue; }
    if (src.startsWith('--', i)) {
      let e = src.indexOf('\n', i); if (e === -1) e = n;
      out.push(tok(K.COMMENT, src.slice(i, e), tl, tc)); i = e; continue;
    }
    if (src.startsWith('/*', i)) {
      let e = src.indexOf('*/', i + 2); e = e === -1 ? n : e + 2;
      out.push(tok(K.COMMENT, src.slice(i, e), tl, tc)); adv(i, e); i = e; continue;
    }
    const l3 = src.slice(i, i + 3).toLowerCase();
    let qs = null;
    if (l3.startsWith("q'")) qs = i + 2; else if (l3 === "nq'") qs = i + 3;
    if (qs !== null && qs < n) {
      const op = src[qs]; const cl = Q_CLOSERS[op] || op;
      let e = src.indexOf(cl + "'", qs + 1); e = e === -1 ? n : e + 2;
      out.push(tok(K.STRING, src.slice(i, e), tl, tc)); adv(i, e); i = e; continue;
    }
    if (ch === "'" || ((ch === 'n' || ch === 'N') && src[i + 1] === "'")) {
      let j = ch === "'" ? i + 1 : i + 2;
      while (j < n) {
        if (src[j] === "'") { if (src[j + 1] === "'") { j += 2; continue; } j++; break; }
        j++;
      }
      out.push(tok(K.STRING, src.slice(i, j), tl, tc)); adv(i, j); i = j; continue;
    }
    if (ch === '"') {
      let e = src.indexOf('"', i + 1); e = e === -1 ? n : e + 1;
      out.push(tok(K.QUOTED, src.slice(i, e), tl, tc)); i = e; continue;
    }
    if (isAlpha(ch) || ch === '_') {
      let j = i + 1;
      while (j < n && (isAlnum(src[j]) || '_$#'.includes(src[j]))) j++;
      out.push(tok(K.WORD, src.slice(i, j), tl, tc)); i = j; continue;
    }
    if (isDigit(ch) || (ch === '.' && i + 1 < n && isDigit(src[i + 1]))) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === '.' && !src.startsWith('..', j)) { j++; while (j < n && isDigit(src[j])) j++; }
      if (j < n && 'eE'.includes(src[j]) && j + 1 < n && (isDigit(src[j + 1]) || '+-'.includes(src[j + 1]))) {
        j += 2; while (j < n && isDigit(src[j])) j++;
      }
      if (j < n && 'dDfF'.includes(src[j]) && !(j + 1 < n && (isAlnum(src[j + 1]) || src[j + 1] === '_'))) j++;
      out.push(tok(K.NUMBER, src.slice(i, j), tl, tc)); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO.has(two)) { out.push(tok(K.SYMBOL, two, tl, tc)); i += 2; continue; }
    out.push(tok(K.SYMBOL, ch, tl, tc)); i++;
  }
  return out;
}

const SEV = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };
const RULES = {};
const OPT_IN = new Set(['PLL009']);

function rule(code, name, severity, summary, fn) { RULES[code] = { code, name, severity, summary, fn }; }

const OPENERS = new Set(['BEGIN', 'CASE', 'IF', 'LOOP']);
function blockStacks(toks) {
  const stack = [], out = [];
  toks.forEach((t, i) => {
    out.push(stack.slice());
    if (t.kind !== K.WORD) return;
    if (OPENERS.has(t.norm)) { if (i && isWord(toks[i - 1], 'END')) return; stack.push(t.norm); }
    else if (t.norm === 'END' && stack.length) stack.pop();
  });
  return out;
}
function handlerEnd(ctx, start, depth) {
  const { toks, blocks } = ctx;
  for (let j = start; j < toks.length; j++) {
    if (blocks[j].length === depth) { if (isWord(toks[j], 'WHEN', 'END')) return j; }
    else if (blocks[j].length < depth) return j;
  }
  return toks.length;
}
const sym = (t, s) => !!t && t.kind === K.SYMBOL && t.text === s;

rule('PLL001', 'when-others-no-raise', SEV.WARNING, 'WHEN OTHERS handler that does not re-raise the error.', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length - 2; i++) {
    if (!(isWord(t[i], 'WHEN') && isWord(t[i + 1], 'OTHERS') && isWord(t[i + 2], 'THEN'))) continue;
    const end = handlerEnd(ctx, i + 3, ctx.blocks[i].length);
    const body = t.slice(i + 3, end);
    if (body.some(b => isWord(b, 'RAISE', 'RAISE_APPLICATION_ERROR'))) continue;
    const sig = body.filter(b => !sym(b, ';'));
    if (sig.length === 1 && isWord(sig[0], 'NULL'))
      yield [t[i], 'WHEN OTHERS THEN NULL silently swallows every error; log and re-raise, or handle specific exceptions', SEV.ERROR];
    else yield [t[i], 'WHEN OTHERS handler does not re-raise; add RAISE (or RAISE_APPLICATION_ERROR) after logging'];
  }
});

function insideExists(t, si) {
  let k = si - 1;
  while (k >= 0 && sym(t[k], '(')) k--;
  return k >= 0 && isWord(t[k], 'EXISTS');
}
rule('PLL002', 'select-star', SEV.WARNING, 'SELECT * makes code break silently when columns change.', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    if (!isWord(t[i], 'SELECT')) continue;
    let j = i + 1;
    if (isWord(t[j], 'DISTINCT', 'UNIQUE', 'ALL')) j++;
    if (sym(t[j], '*') && !insideExists(t, i)) yield [t[j], 'avoid SELECT *; list the columns you need'];
  }
});

rule('PLL003', 'commit-in-loop', SEV.WARNING, 'COMMIT or ROLLBACK inside a loop (slow, breaks atomicity, ORA-01555 risk).', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    if (isWord(t[i], 'COMMIT', 'ROLLBACK') && ctx.blocks[i].includes('LOOP')) {
      if (i && isWord(t[i - 1], 'ON', 'PRESERVE', 'DELETE')) continue;
      yield [t[i], `${t[i].norm} inside a loop; commit once after the loop or use bulk processing`];
    }
  }
});

const COMPARE = new Set(['=', '<>', '!=', '^=', '~=']);
const COND = new Set(['WHERE', 'ON', 'HAVING', 'WHEN', 'IF', 'ELSIF', 'WHILE', 'AND', 'OR', 'NOT', 'RETURN', 'THEN', 'ELSE', 'BEGIN', 'LOOP', 'CHECK']);
function inSetClause(t, idx) {
  let depth = 0;
  for (let k = idx - 1; k >= 0; k--) {
    const x = t[k];
    if (x.kind === K.SYMBOL) {
      if (x.text === ')') depth++;
      else if (x.text === '(') { if (depth === 0) return false; depth--; }
      else if (x.text === ';' && depth === 0) return false;
      continue;
    }
    if (depth) continue;
    if (isWord(x, 'SET')) return true;
    if (x.kind === K.WORD && COND.has(x.norm)) return false;
  }
  return false;
}
rule('PLL004', 'compare-with-null', SEV.ERROR, 'Comparison with NULL using = or <> is never true; use IS [NOT] NULL.', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    if (t[i].kind !== K.SYMBOL || !COMPARE.has(t[i].text)) continue;
    if (!(isWord(t[i + 1], 'NULL') || (i > 0 && isWord(t[i - 1], 'NULL')))) continue;
    if (t[i].text === '=' && inSetClause(t, i)) continue;
    yield [t[i], `'${t[i].text} NULL' is never true; use ${t[i].text === '=' ? 'IS NULL' : 'IS NOT NULL'}`];
  }
});

rule('PLL005', 'dynamic-sql-concat', SEV.WARNING, 'Dynamic SQL built by concatenation (SQL injection risk, no plan reuse).', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    let start = null;
    if (isWord(t[i], 'EXECUTE') && isWord(t[i + 1], 'IMMEDIATE')) start = i + 2;
    else if (isWord(t[i], 'FOR') && i >= 2 && isWord(t[i - 2], 'OPEN')) {
      const nx = t[i + 1];
      if (nx && !isWord(nx, 'SELECT', 'WITH') && !sym(nx, '(')) start = i + 1;
    }
    if (start === null) continue;
    let concat = false;
    for (let j = start; j < t.length; j++) {
      const x = t[j];
      if (sym(x, ';')) break;
      if (isWord(x, 'USING', 'INTO', 'BULK', 'RETURNING', 'RETURN')) break;
      if (isWord(x, 'DBMS_ASSERT')) { concat = false; break; }
      if (sym(x, '||')) concat = true;
    }
    if (concat) yield [t[i], "dynamic SQL built with '||'; use bind variables (USING) and DBMS_ASSERT for identifiers"];
  }
});

rule('PLL006', 'dbms-output', SEV.INFO, 'DBMS_OUTPUT left in code; use a logging package instead.', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++)
    if (isWord(t[i], 'DBMS_OUTPUT') && t[i + 1] && t[i + 1].text === '.') yield [t[i], 'DBMS_OUTPUT call; remove debug output or use a logger'];
});

rule('PLL007', 'goto', SEV.WARNING, 'GOTO makes control flow hard to follow.', function* (ctx) {
  for (const x of ctx.toks) if (isWord(x, 'GOTO')) yield [x, 'avoid GOTO; restructure with loops, EXIT or procedures'];
});

rule('PLL008', 'rownum-order-by', SEV.WARNING, 'ROWNUM filter combined with ORDER BY in the same query (filter runs first).', function* (ctx) {
  const t = ctx.toks;
  let frames = [{ where: false, rownum: null }];
  for (let i = 0; i < t.length; i++) {
    const f = frames[frames.length - 1], x = t[i];
    if (x.kind === K.SYMBOL) {
      if (x.text === '(') frames.push({ where: false, rownum: null });
      else if (x.text === ')' && frames.length > 1) frames.pop();
      else if (x.text === ';') frames = [{ where: false, rownum: null }];
      continue;
    }
    if (isWord(x, 'SELECT')) { f.where = false; f.rownum = null; }
    else if (isWord(x, 'WHERE')) f.where = true;
    else if (isWord(x, 'ROWNUM') && f.where && !f.rownum) f.rownum = x;
    else if (isWord(x, 'ORDER') && f.rownum && isWord(t[i + 1], 'BY', 'SIBLINGS')) {
      yield [f.rownum, 'ROWNUM is applied before ORDER BY; sort in a subquery or use FETCH FIRST n ROWS ONLY'];
      f.rownum = null;
    }
  }
});

rule('PLL009', 'line-too-long', SEV.INFO, 'Line longer than the configured maximum (default 120).', function* (ctx) {
  ctx.lines.forEach((text, k) => {
    const w = text.replace(/[\r\n]+$/, '').length;
    if (w > ctx.maxLineLength) ctx._tmp.push([{ line: k + 1, col: ctx.maxLineLength + 1 }, `line is ${w} characters long (max ${ctx.maxLineLength})`]);
  });
  yield* ctx._tmp.splice(0);
});

rule('PLL010', 'raise-app-error-range', SEV.ERROR, 'RAISE_APPLICATION_ERROR number outside -20000..-20999 (raises ORA-21000).', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    if (!isWord(t[i], 'RAISE_APPLICATION_ERROR') || !t[i + 1] || t[i + 1].text !== '(') continue;
    let j = i + 2, sign = 1;
    if (t[j] && t[j].kind === K.SYMBOL && (t[j].text === '+' || t[j].text === '-')) { sign = t[j].text === '-' ? -1 : 1; j++; }
    if (t[j] && t[j].kind === K.NUMBER && /^\d+$/.test(t[j].text)) {
      const v = sign * parseInt(t[j].text, 10);
      if (!(v >= -20999 && v <= -20000)) yield [t[j], `error number ${v} is outside -20000..-20999`];
    }
  }
});

function unitEnd(t, start) {
  for (let k = start; k < t.length; k++) {
    const x = t[k];
    if (sym(x, '/') && k > 0 && t[k - 1].text === ';') {
      const e = k - 2;
      if (e >= 0 && isWord(t[e], 'END')) return e;
      return null;
    }
    if (isWord(x, 'CREATE') && k > start) return null;
  }
  return null;
}
rule('PLL011', 'end-without-name', SEV.INFO, 'Named END without the unit name (END; instead of END my_proc;).', function* (ctx) {
  const t = ctx.toks;
  let i = 0;
  while (i < t.length) {
    if (isWord(t[i], 'CREATE')) {
      let j = i + 1;
      while (j < t.length && isWord(t[j], 'OR', 'REPLACE', 'EDITIONABLE', 'NONEDITIONABLE')) j++;
      if (isWord(t[j], 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER')) {
        let k = j + 1;
        if (isWord(t[k], 'BODY')) k++;
        let ni = k;
        while (ni + 2 < t.length && t[ni + 1].text === '.') ni += 2;
        const e = unitEnd(t, ni);
        if (e !== null) {
          if (t[e + 1] && t[e + 1].text === ';') yield [t[e], `add the unit name after END (END ${t[ni].text};) for readability`];
          i = e;
        }
      }
    }
    i++;
  }
});

rule('PLL012', 'compare-with-empty-string', SEV.ERROR, "Comparison with '' is never true: Oracle treats the empty string as NULL.", function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    if (t[i].kind !== K.SYMBOL || !COMPARE.has(t[i].text)) continue;
    for (const s of [t[i + 1], i > 0 ? t[i - 1] : undefined]) {
      if (s && s.kind === K.STRING && ["''", "N''", "n''"].includes(s.text)) {
        if (t[i].text === '=' && inSetClause(t, i)) break;
        yield [t[i], `'' is NULL in Oracle, so '${t[i].text} ''' is never true; use ${t[i].text === '=' ? 'IS NULL' : 'IS NOT NULL'}`];
        break;
      }
    }
  }
});

rule('PLL013', 'varchar-type', SEV.INFO, 'VARCHAR declared instead of VARCHAR2 (Oracle reserves VARCHAR for future semantics).', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++)
    if (isWord(t[i], 'VARCHAR') && t[i + 1] && t[i + 1].kind === K.SYMBOL && ['(', ';', ',', ':='].includes(t[i + 1].text))
      yield [t[i], 'use VARCHAR2 instead of VARCHAR'];
});

rule('PLL014', 'not-in-subquery', SEV.WARNING, 'NOT IN (SELECT ...) returns no rows when the subquery yields a NULL; prefer NOT EXISTS.', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length - 3; i++)
    if (isWord(t[i], 'NOT') && isWord(t[i + 1], 'IN') && t[i + 2].text === '(' && isWord(t[i + 3], 'SELECT', 'WITH'))
      yield [t[i], 'NOT IN with a subquery matches nothing if the subquery returns a NULL; use NOT EXISTS or filter NULLs in the subquery'];
});

rule('PLL015', 'to-date-no-format', SEV.WARNING, 'TO_DATE / TO_TIMESTAMP without a format mask depends on NLS settings.', function* (ctx) {
  const t = ctx.toks;
  for (let i = 0; i < t.length; i++) {
    if (!isWord(t[i], 'TO_DATE', 'TO_TIMESTAMP', 'TO_TIMESTAMP_TZ') || !t[i + 1] || t[i + 1].text !== '(') continue;
    let depth = 0, args = 1;
    for (let j = i + 1; j < t.length; j++) {
      const x = t[j];
      if (x.kind !== K.SYMBOL) continue;
      if (x.text === '(') depth++;
      else if (x.text === ')') { depth--; if (depth === 0) break; }
      else if (x.text === ',' && depth === 1) args++;
      else if (x.text === ';') break;
    }
    if (args === 1) yield [t[i], `${t[i].norm} without a format mask uses NLS_DATE_FORMAT; pass an explicit mask, e.g. ${t[i].norm}(x, 'YYYY-MM-DD')`];
  }
});

const DIRECTIVE = /plsql-lint:\s*(disable-file|disable)(?:\s*=\s*([A-Za-z0-9_,\s]+))?/gi;
const NOQA = /\bnoqa\b(?::\s*([A-Za-z0-9_,\s]+))?/gi;
const codes = raw => raw ? new Set(raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)) : new Set(['*']);

/**
 * Lint source text.
 * @param {string} source
 * @param {{select?: string[], ignore?: string[], maxLineLength?: number}} [cfg]
 * @returns {{code:string,message:string,line:number,col:number,severity:string}[]}
 */
function lint(source, cfg = {}) {
  const all = tokenize(source);
  const toks = all.filter(t => t.kind !== K.COMMENT);
  const lineOff = new Map(); const fileOff = new Set();
  const addLine = (l, s) => { if (!lineOff.has(l)) lineOff.set(l, new Set()); s.forEach(c => lineOff.get(l).add(c)); };
  for (const t of all) {
    if (t.kind !== K.COMMENT) continue;
    for (const m of t.text.matchAll(DIRECTIVE)) {
      const c = codes(m[2]);
      if (m[1].toLowerCase() === 'disable-file') c.forEach(x => fileOff.add(x)); else addLine(t.line, c);
    }
    for (const m of t.text.matchAll(NOQA)) addLine(t.line, codes(m[1]));
  }
  const select = new Set(cfg.select || Object.keys(RULES).filter(c => !OPT_IN.has(c)));
  const ignore = new Set(cfg.ignore || []);
  const ctx = { toks, lines: source.split(/\r\n|\r|\n/), maxLineLength: cfg.maxLineLength || 120, _tmp: [] };
  if (source.endsWith('\n')) ctx.lines.pop();
  ctx.blocks = blockStacks(toks);
  const out = [];
  for (const code of Object.keys(RULES).sort()) {
    if (!select.has(code) || ignore.has(code) || fileOff.has('*') || fileOff.has(code)) continue;
    const r = RULES[code];
    for (const [t, msg, sev] of r.fn(ctx)) {
      const off = lineOff.get(t.line);
      if (off && (off.has('*') || off.has(code))) continue;
      out.push({ code, message: msg, line: t.line, col: t.col, severity: sev || r.severity });
    }
  }
  out.sort((a, b) => a.line - b.line || a.col - b.col || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return out;
}

module.exports = { lint, tokenize, RULES, OPT_IN };

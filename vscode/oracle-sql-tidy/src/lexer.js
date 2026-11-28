'use strict';
// Oracle SQL / PL/SQL / SQL*Plus tokenizer that keeps every character: strings (incl. q'[...]' and N'...'),
// quoted identifiers, comments, bind and substitution variables, and whole SQL*Plus command lines.

const Q_CLOSERS = { '[': ']', '{': '}', '(': ')', '<': '>' };
const OPS = ['||', ':=', '=>', '<>', '!=', '^=', '~=', '<=', '>=', '..', '**', '<<', '>>'];
const SQLPLUS = [
  /^(prompt|pro|rem|remark|spool|spo|define|def|undefine|undef|whenever|show|sho|exec|ttitle|btitle|clear|pause|host|accept|acc|break|compute)\b(?!\s*[(:=.,;+\-*/|<>!)%@'])/i,
  /^desc(ribe)?\s+[\w.$#"@]+\s*;?\s*$/i,
  /^set\s+(serveroutput|serverout|echo|feedback|feed|linesize|lines|pagesize|pages|heading|head|timing|define|verify|ver|termout|term|trimspool|trims|trimout|long|sqlblanklines|autotrace|autot|colsep|newpage|arraysize|tab|wrap|markup|sqlprompt|escape|scan|concat|numwidth|null|time|appinfo|sqlterminator)\b/i,
  /^col(umn)?\s+\S+\s+(format|for|heading|hea|new_value|noprint|print|clear|justify|wrapped|truncated|word_wrapped)\b/i,
  /^var(iable)?\s+\w+\s+\w+/i,
  /^print(\s+:?\w+)?\s*$/i,
  /^@@?\S/
];
const isWordStart = c => /[\p{L}_]/u.test(c);
const isWordChar = c => /[\p{L}\p{N}_$#]/u.test(c);
const isDigit = c => c >= '0' && c <= '9';

/**
 * @returns {{type:string,text:string,start:number,end:number,nlBefore:number,sol:boolean}[]}
 * types: word, qident, string, number, op, lcomment, bcomment, bind, subst, sqlplus
 */
function tokenize(src) {
  const out = [];
  const n = src.length;
  let i = 0, nl = 0, sol = true;
  const push = (type, end) => { out.push({ type, text: src.slice(i, end), start: i, end, nlBefore: nl, sol }); i = end; nl = 0; sol = false; };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { nl++; sol = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') { i++; continue; }
    if (sol && commandAllowed(out)) {
      let e = src.indexOf('\n', i); if (e === -1) e = n;
      const line = src.slice(i, e);
      if (SQLPLUS.some(r => r.test(line))) { push('sqlplus', line.endsWith('\r') ? e - 1 : e); continue; }
    }
    if (src.startsWith('--', i)) { let e = src.indexOf('\n', i); if (e === -1) e = n; if (src[e - 1] === '\r') e--; push('lcomment', e); continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); push('bcomment', e === -1 ? n : e + 2); continue; }
    const l3 = src.slice(i, i + 3).toLowerCase();
    let qs = -1;
    if (l3.startsWith("q'")) qs = i + 2; else if (l3 === "nq'") qs = i + 3;
    if (qs !== -1 && qs < n && !/\s/.test(src[qs])) {
      const cl = Q_CLOSERS[src[qs]] || src[qs];
      const e = src.indexOf(cl + "'", qs + 1);
      push('string', e === -1 ? n : e + 2); continue;
    }
    if (c === "'" || ((c === 'n' || c === 'N') && src[i + 1] === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      while (j < n) { if (src[j] === "'") { if (src[j + 1] === "'") { j += 2; continue; } j++; break; } j++; if (j === n) break; }
      push('string', Math.min(j, n)); continue;
    }
    if (c === '"') { const e = src.indexOf('"', i + 1); push('qident', e === -1 ? n : e + 1); continue; }
    if (c === ':' && i + 1 < n && (isWordStart(src[i + 1]) || isDigit(src[i + 1]) || src[i + 1] === '"')) {
      let j = i + 1;
      if (src[j] === '"') { const e = src.indexOf('"', j + 1); j = e === -1 ? n : e + 1; } else while (j < n && isWordChar(src[j])) j++;
      push('bind', j); continue;
    }
    if (c === '&') {
      let j = i + 1; if (src[j] === '&') j++;
      if (j < n && isWordStart(src[j])) { while (j < n && isWordChar(src[j])) j++; push('subst', j); continue; }
    }
    if (isWordStart(c)) { let j = i + 1; while (j < n && isWordChar(src[j])) j++; push('word', j); continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === '.' && src[j + 1] !== '.') { j++; while (j < n && isDigit(src[j])) j++; }
      if ((src[j] === 'e' || src[j] === 'E') && (isDigit(src[j + 1] || '') || ((src[j + 1] === '+' || src[j + 1] === '-') && isDigit(src[j + 2] || '')))) { j += 2; while (j < n && isDigit(src[j])) j++; }
      if (/[dDfF]/.test(src[j] || '') && !isWordChar(src[j + 1] || '')) j++;
      push('number', j); continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS.includes(two)) { push('op', i + 2); continue; }
    push('op', i + 1);
  }
  return out;
}

/** SQL*Plus commands are recognised only where a new command can start: at the top, or after ";", "/" or another command. */
function commandAllowed(out) {
  for (let k = out.length - 1; k >= 0; k--) {
    const t = out[k];
    if (t.type === 'lcomment' || t.type === 'bcomment') continue;
    return t.type === 'sqlplus' || (t.type === 'op' && (t.text === ';' || (t.text === '/' && t.sol)));
  }
  return true;
}

module.exports = { tokenize };

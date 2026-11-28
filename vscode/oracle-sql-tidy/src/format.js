'use strict';
// Oracle SQL and PL/SQL formatter. It only changes whitespace and the case of unquoted words:
// strings, quoted identifiers, comments and SQL*Plus command lines are copied unchanged, and
// sameTokens() lets callers verify that before replacing any text.
const { tokenize } = require('./lexer');
const { KEYWORDS, FUNCTIONS } = require('./words');

const DEFAULTS = { keywordCase: 'upper', functionCase: null, identifierCase: 'preserve', indentSize: 4, useTabs: false, commaStyle: 'trailing', maxLineWidth: 0, baseIndent: '' };
// functionCase null = same as keywordCase; maxLineWidth 0 = no soft wrapping

const applyCase = (s, mode) => mode === 'upper' ? s.toUpperCase() : mode === 'lower' ? s.toLowerCase() : s;

/** Case for one word token, given its neighbours (words next to '.' are names, not keywords). */
function wordCase(toks, i, o) {
  const t = toks[i];
  const prev = prevSig(toks, i), next = nextSig(toks, i);
  const up = t.text.toUpperCase();
  const dotted = (prev && prev.text === '.') || (next && next.text === '.');
  if (prev && prev.text === '%' && KEYWORDS.has(up)) return applyCase(t.text, o.keywordCase); // %ROWTYPE, %NOTFOUND
  if (dotted) return applyCase(t.text, o.identifierCase);
  if (FUNCTIONS.has(up) && next && next.text === '(') return applyCase(t.text, o.functionCase || o.keywordCase);
  if (KEYWORDS.has(up)) return applyCase(t.text, o.keywordCase);
  return applyCase(t.text, o.identifierCase);
}
function prevSig(toks, i) { for (let k = i - 1; k >= 0; k--) if (!isComment(toks[k])) return toks[k]; return null; }
function nextSig(toks, i) { for (let k = i + 1; k < toks.length; k++) if (!isComment(toks[k])) return toks[k]; return null; }
const isComment = t => t.type === 'lcomment' || t.type === 'bcomment';

/** Changes only the case of keywords/functions/identifiers; every other character stays where it is. */
function changeCase(src, opts = {}) {
  const o = Object.assign({}, DEFAULTS, opts);
  const toks = tokenize(src);
  let out = '', pos = 0;
  toks.forEach((t, i) => {
    out += src.slice(pos, t.start);
    out += t.type === 'word' ? wordCase(toks, i, o) : t.text;
    pos = t.end;
  });
  return out + src.slice(pos);
}

/** True when both texts have the same tokens (words compared without case). */
function sameTokens(a, b) {
  const ta = tokenize(a), tb = tokenize(b);
  if (ta.length !== tb.length) return false;
  for (let i = 0; i < ta.length; i++) {
    const x = ta[i], y = tb[i];
    if (x.type !== y.type) return false;
    if (x.type === 'word' ? x.text.toUpperCase() !== y.text.toUpperCase() : x.text.trimEnd() !== y.text.trimEnd()) return false;
  }
  return true;
}

const SPACE_PAREN = new Set(['IN', 'AND', 'OR', 'NOT', 'EXISTS', 'AS', 'IS', 'FROM', 'JOIN', 'ON', 'USING', 'VALUES', 'INTO', 'SELECT',
  'WHERE', 'THEN', 'ELSE', 'WHEN', 'RETURN', 'RETURNING', 'BY', 'OVER', 'GROUP', 'HAVING', 'SET', 'ALL', 'ANY', 'SOME', 'UNION',
  'INTERSECT', 'MINUS', 'INSERT', 'CASE', 'LOOP', 'IF', 'ELSIF', 'WHILE', 'PIVOT', 'UNPIVOT', 'FOR', 'BETWEEN', 'LIKE', 'MATCHED', 'DEFAULT', 'CHECK', 'KEY', 'LATERAL', 'APPLY', 'WITH']);
const SPACE_PAREN_AFTER_NAME = new Set(['INTO', 'TABLE', 'VIEW', 'ON', 'TYPE', 'INDEX', 'CURSOR', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'REFERENCES']);
const UNARY_AFTER = new Set(['RETURN', 'THEN', 'ELSE', 'SELECT', 'WHEN', 'AND', 'OR', 'NOT', 'IN', 'BY', 'VALUES', 'WHERE', 'SET', 'ON', 'IS', 'BETWEEN', 'LIKE']);
const JOIN_START = { LEFT: ['OUTER', 'JOIN'], RIGHT: ['OUTER', 'JOIN'], FULL: ['OUTER', 'JOIN'], INNER: ['JOIN'], CROSS: ['JOIN', 'APPLY'], NATURAL: ['JOIN', 'LEFT', 'RIGHT', 'FULL', 'INNER'], OUTER: ['APPLY'], JOIN: null };
const SQLPLUS_WORDS = new Set(['PROMPT', 'PRO', 'REM', 'REMARK', 'SPOOL', 'SPO', 'DEFINE', 'DEF', 'UNDEFINE', 'UNDEF', 'WHENEVER', 'SHOW', 'SHO', 'EXEC',
  'TTITLE', 'BTITLE', 'CLEAR', 'PAUSE', 'HOST', 'ACCEPT', 'ACC', 'BREAK', 'COMPUTE', 'SET', 'COL', 'COLUMN', 'VAR', 'VARIABLE', 'PRINT', 'DESC', 'DESCRIBE']);
const COND_CLAUSES = new Set(['WHERE', 'HAVING', 'ON', 'CONNECT', 'START']);
const LIST_CLAUSES = new Set(['SELECT', 'GROUP', 'ORDER', 'SET', 'FROM', 'WITH']);

/**
 * Formats SQL and PL/SQL.
 * @param {string} src
 * @param {{keywordCase?:string, functionCase?:string, identifierCase?:string, indentSize?:number, useTabs?:boolean, commaStyle?:'trailing'|'leading', maxLineWidth?:number, baseIndent?:string}} [opts]
 */
function format(src, opts = {}) {
  const o = Object.assign({}, DEFAULTS, opts);
  const unit = o.useTabs ? '\t' : ' '.repeat(Math.max(0, o.indentSize | 0));
  const toks = tokenize(src);
  const lines = [];
  let cur = { indent: 0, text: '' };
  let last = null;           // last emitted token (with .out text and flags)
  let pendingBreak = false;  // a line comment ended the line

  const flush = () => { if (cur.text !== '') lines.push(o.baseIndent + unit.repeat(cur.indent) + cur.text); };
  const nl = ind => { flush(); cur = { indent: Math.max(0, ind), text: '' }; pendingBreak = false; last = cur.text === '' ? last : last; };
  const nlIf = ind => { if (cur.text !== '') nl(ind); else { cur.indent = Math.max(0, ind); pendingBreak = false; } };
  const blankLine = () => { flush(); if (lines.length && lines[lines.length - 1] !== '') lines.push(''); cur = { indent: cur.indent, text: '' }; };

  // ---- state
  let blocks = [];           // {type:'decl'|'body'|'if'|'loop'|'case', inner, exc, handler, firstWhen}
  const top = () => blocks[blocks.length - 1];
  const stmtIndent = () => { const b = top(); return b ? b.inner + (b.handler ? 1 : 0) : 0; };
  const newFrame = base => ({ kind: 'stmt', base, clause: null, stmt: null, bumped: false, between: false });
  let frames = [newFrame(0)];
  const F = () => frames[frames.length - 1];
  let stmtStart = true, caseExpr = 0, ctl = null, ctlIndent = 0, header = null, headerIndent = 0, afterEnd = false;

  const endStatement = () => { frames = [newFrame(stmtIndent())]; caseExpr = 0; ctl = null; header = null; stmtStart = true; };

  function spaceBetween(p, t) {
    if (!p || cur.text === '') return false;
    const pt = p.text, tt = t.text;
    if (tt === ',' || tt === ';' || tt === ')' || tt === '.' || tt === '%' || tt === '@' || tt === '..') return false;
    if (pt === '(' || pt === '.' || pt === '%' || pt === '@' || pt === '..') return false;
    if (p.unary) return false;
    if (tt === '(') {
      if (p.type === 'word') {
        if (SPACE_PAREN.has(p.text.toUpperCase())) return true;
        if (p.prevWord && SPACE_PAREN_AFTER_NAME.has(p.prevWord)) return true;
        return false;
      }
      if (p.type === 'qident' || p.type === 'bind' || p.type === 'subst') return false;
      return true;
    }
    return true;
  }
  const width = () => o.baseIndent.length + unit.length * cur.indent + cur.text.length;
  // a soft wrap never splits a multi-line token, never moves a comment and never leaves "/" or a SQL*Plus word at a line start
  const canWrap = out => out.type !== 'lcomment' && out.type !== 'bcomment' && !cur.text.includes('\n') && !out.text.includes('\n')
    && cur.text !== '/' && !(out.type === 'word' && SQLPLUS_WORDS.has(out.text.toUpperCase())) && out.text !== '@';
  function emit(t, text) {
    if (pendingBreak) nl(cur.indent);
    const out = { type: t.type, text: text === undefined ? t.text : text, unary: false, prevWord: null };
    if (spaceBetween(last, out)) {
      if (o.maxLineWidth > 0 && canWrap(out) && width() + 1 + out.text.length > o.maxLineWidth) {
        const cont = (cur.cont === undefined ? cur.indent : cur.cont) + 1;
        flush(); cur = { indent: cont, text: '', cont: cont - 1 };
      } else cur.text += ' ';
    }
    cur.text += out.text;
    out.prevWord = last && last.type === 'word' ? last.text.toUpperCase() : null;
    last = out;
    return out;
  }

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const up = t.type === 'word' ? t.text.toUpperCase() : null;
    const nx = nextSig(toks, i), nxUp = nx && nx.type === 'word' ? nx.text.toUpperCase() : null;
    const nx2 = nx ? nextSig(toks, toks.indexOf(nx)) : null, nx2Up = nx2 && nx2.type === 'word' ? nx2.text.toUpperCase() : null;
    let keepStart = false;
    const f = F();
    const atRoot = frames.length === 1;

    if (t.nlBefore >= 2 && (stmtStart || (isComment(t) && t.sol)) && lines.length + (cur.text ? 1 : 0) > 0) blankLine();

    // comments and SQL*Plus lines are copied as they are
    if (t.type === 'lcomment' || t.type === 'bcomment') {
      if (t.sol && cur.text !== '') nl(stmtStart ? stmtIndent() : cur.indent);
      if (!t.sol && cur.text === '' && !pendingBreak && lines.length && lines[lines.length - 1] !== '') {
        lines[lines.length - 1] += ' ' + t.text.replace(/\s+$/, '');   // "x := 1; -- note" keeps its comment
        continue;
      }
      const save = last;
      emit(t, t.text.replace(/\s+$/, ''));
      last = save && t.type === 'bcomment' && !t.sol ? { ...save, unary: false } : save;
      if (t.type === 'lcomment' || (nx && nx.nlBefore > 0 && t.sol)) pendingBreak = true;
      if (stmtStart) keepStart = true;
      stmtStart = keepStart;
      continue;
    }
    if (t.type === 'sqlplus') {
      nlIf(0); cur.text = t.text.replace(/\s+$/, ''); nl(0); last = null;
      blocks = []; endStatement(); frames = [newFrame(0)];
      continue;
    }
    // "/" alone on its line runs the buffer in SQL*Plus
    if (t.text === '/' && t.sol && (!nx || nx.nlBefore > 0) && atRoot) {
      nlIf(0); cur.text = '/'; nl(0); last = null;
      blocks = []; endStatement(); frames = [newFrame(0)];
      continue;
    }

    if (t.type === 'word') {
      const text = wordCase(toks, i, o);
      if (afterEnd) { afterEnd = false; emit(t, text); continue; } // END IF / END LOOP / END CASE / END name

      if (atRoot && caseExpr === 0) {
        // ---- PL/SQL blocks
        if (up === 'DECLARE' && (stmtStart || header === 'TRIGGER')) {
          nlIf(stmtIndent()); emit(t, text);
          blocks.push({ type: 'decl', inner: stmtIndent() + 1 });
          nl(top().inner); endStatement(); continue;
        }
        if (up === 'BEGIN') {
          const b = top();
          if (b && b.type === 'decl') { b.type = 'body'; nlIf(b.inner - 1); emit(t, text); }
          else { const ind = header ? headerIndent : stmtIndent(); nlIf(ind); emit(t, text); blocks.push({ type: 'body', inner: ind + 1 }); }
          nl(top().inner); endStatement(); continue;
        }
        if ((up === 'IS' || up === 'AS') && header && header !== 'TRIGGER' && !['LANGUAGE', 'EXTERNAL'].includes(nxUp)) {
          emit(t, text);
          blocks.push({ type: 'decl', inner: headerIndent + 1 });
          nl(top().inner); endStatement(); continue;
        }
        if (up === 'EXCEPTION' && stmtStart && top() && top().type === 'body') {
          const b = top(); b.exc = true; b.handler = false;
          nlIf(b.inner - 1); emit(t, text); nl(b.inner); endStatement(); continue;
        }
        if (up === 'WHEN' && top() && ((stmtStart && top().exc) || (top().type === 'case' && (stmtStart || top().firstWhen)))) {
          const b = top(); b.handler = false; b.firstWhen = false;
          nlIf(b.inner); emit(t, text); ctl = 'when'; stmtStart = false; continue;
        }
        if (up === 'THEN' && (ctl === 'when' || ctl === 'if')) {
          emit(t, text);
          if (ctl === 'when') top().handler = true;
          nl(stmtIndent()); endStatement(); continue;
        }
        if (up === 'IF' && stmtStart) {
          const ind = stmtIndent(); nlIf(ind); emit(t, text);
          blocks.push({ type: 'if', inner: ind + 1 }); ctl = 'if'; stmtStart = false; continue;
        }
        if (up === 'ELSIF' && top() && top().type === 'if') { nlIf(top().inner - 1); emit(t, text); ctl = 'if'; stmtStart = false; continue; }
        if (up === 'ELSE' && top() && top().type === 'if' && (stmtStart || ctl === null)) {
          nlIf(top().inner - 1); emit(t, text); nl(top().inner); endStatement(); continue;
        }
        if (up === 'ELSE' && top() && top().type === 'case' && stmtStart) {
          const b = top(); b.handler = false; nlIf(b.inner); emit(t, text); b.handler = true; nl(stmtIndent()); endStatement(); continue;
        }
        if (up === 'CASE' && stmtStart) {
          const ind = stmtIndent(); nlIf(ind); emit(t, text);
          blocks.push({ type: 'case', inner: ind + 1, firstWhen: true }); stmtStart = false; continue;
        }
        if ((up === 'FOR' || up === 'WHILE') && stmtStart) { ctl = 'loop'; ctlIndent = stmtIndent(); nlIf(ctlIndent); emit(t, text); stmtStart = false; continue; }
        if (up === 'LOOP' && (stmtStart || ctl === 'loop')) {
          const ind = ctl === 'loop' ? ctlIndent : stmtIndent();
          if (stmtStart) nlIf(ind);
          emit(t, text); blocks.push({ type: 'loop', inner: ind + 1 }); nl(ind + 1); endStatement(); continue;
        }
        if (up === 'END' && blocks.length) {
          const b = blocks.pop();
          nlIf(b.inner - 1); emit(t, text);
          if (nx && nx.type === 'word') afterEnd = true;
          frames = [newFrame(b.inner - 1)]; ctl = null; stmtStart = false; continue;
        }
        if ((up === 'PROCEDURE' || up === 'FUNCTION' || up === 'PACKAGE' || up === 'TRIGGER' || (up === 'TYPE' && nxUp === 'BODY')) && !header && f.stmt !== 'DROP' && !(stmtStart && false)) {
          if (stmtStart || ['CREATE', 'REPLACE', 'EDITIONABLE', 'NONEDITIONABLE', 'MEMBER', 'STATIC', 'CONSTRUCTOR', 'MAP', 'ORDER', 'OVERRIDING', 'FINAL', 'INSTANTIABLE'].includes(last && last.type === 'word' ? last.text.toUpperCase() : '')) {
            header = up; headerIndent = stmtIndent();
            if (stmtStart) nlIf(headerIndent);
            if (!f.stmt) f.stmt = up;
            emit(t, text); stmtStart = false; continue;
          }
        }
      }

      if (up === 'CASE') { if (!(last && last.text.toUpperCase() === 'END')) caseExpr++; }
      else if (up === 'END' && caseExpr > 0) caseExpr--;

      // ---- SQL clauses (only at the level of a statement or subquery, not inside function arguments)
      if (f.kind === 'stmt' && caseExpr === 0 || (f.kind === 'stmt' && up === 'CASE')) {
        if (stmtStart) {
          nlIf(f.base);
          f.stmt = up;
          if (['SELECT', 'UPDATE', 'WITH', 'DELETE', 'MERGE', 'INSERT'].includes(up)) f.clause = up;
          emit(t, text); stmtStart = false; continue;
        }
        const lu = last && last.type === 'word' ? last.text.toUpperCase() : (last ? last.text : '');
        let brk = null, clause = null;
        if (up === 'SELECT') {
          clause = 'SELECT';
          if (lu === '(' || cur.text === '') brk = null;
          else if (['UNION', 'ALL', 'INTERSECT', 'MINUS', 'EXCEPT', 'DISTINCT'].includes(lu) || (f.stmt === 'WITH' && lu === ')')) brk = f.base;
          else { if (!f.bumped) { f.bumped = true; f.base++; } brk = f.base; }
        } else if (up === 'FROM' && lu !== 'DELETE' && f.clause !== 'FETCHCUR') { clause = 'FROM'; brk = f.base; }
        else if (up === 'WHERE' || up === 'HAVING') { clause = up; brk = f.base; }
        else if ((up === 'GROUP' || up === 'ORDER') && (nxUp === 'BY' || (up === 'ORDER' && nxUp === 'SIBLINGS'))) { clause = up; brk = f.base; }
        else if (['UNION', 'INTERSECT', 'MINUS', 'EXCEPT'].includes(up)) { clause = 'SET'; brk = f.base; clause = null; f.clause = null; }
        else if (up === 'CONNECT' && nxUp === 'BY') { clause = 'CONNECT'; brk = f.base; }
        else if (up === 'START' && nxUp === 'WITH') { clause = 'START'; brk = f.base; }
        else if (up === 'INTO' && f.clause === 'SELECT') { clause = 'INTO'; brk = f.base; }
        else if (up === 'VALUES' && ['INSERT', 'MERGE'].includes(f.stmt)) { clause = 'VALUES'; brk = f.base; }
        else if (up === 'SET' && f.clause === 'UPDATE') { clause = 'SET'; brk = f.base; }
        else if (up === 'UPDATE' && f.stmt === 'MERGE') { clause = 'UPDATE'; }
        else if (up === 'RETURNING' && ['INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(f.stmt)) { clause = 'RETURNING'; brk = f.base; }
        else if (up === 'USING' && f.stmt === 'MERGE' && f.clause !== 'USING') { clause = 'USING'; brk = f.base; }
        else if (up === 'ON' && f.stmt === 'MERGE' && f.clause === 'USING') { clause = 'ON'; brk = f.base; }
        else if (up === 'WHEN' && f.stmt === 'MERGE' && (nxUp === 'MATCHED' || (nxUp === 'NOT' && nx2Up === 'MATCHED'))) { clause = 'WHEN'; brk = f.base; }
        else if (up === 'FETCH' && (nxUp === 'FIRST' || nxUp === 'NEXT')) { clause = 'FETCH'; brk = f.base; }
        else if (up === 'OFFSET' && nx && (nx.type === 'number' || nx.type === 'bind') && ['ROW', 'ROWS'].includes(nx2Up)) { clause = 'OFFSET'; brk = f.base; }
        else if (up === 'FOR' && nxUp === 'UPDATE' && f.stmt !== 'TRIGGER') { clause = 'FORUPDATE'; brk = f.base; }
        else if (up in JOIN_START && (f.clause === 'FROM' || f.clause === 'ON') && (JOIN_START[up] === null || JOIN_START[up].includes(nxUp)) && !(up === 'OUTER' && lu !== 'APPLY' && nxUp !== 'APPLY')) {
          if (!['LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'NATURAL', 'OUTER'].includes(lu)) brk = f.base + 1;
          clause = 'FROM';
        } else if (up === 'ON' && f.clause === 'FROM') { clause = 'ON'; }
        else if (up === 'BETWEEN') f.between = true;
        else if ((up === 'AND' || up === 'OR') && COND_CLAUSES.has(f.clause) && !ctl) {
          if (up === 'AND' && f.between) f.between = false;
          else brk = f.base + (f.clause === 'ON' ? 2 : 1);
        }
        if (clause) f.clause = clause;
        if (brk !== null) nlIf(brk);
        emit(t, text); stmtStart = false; continue;
      }
      if (up === 'BETWEEN') f.between = true;
      emit(t, text); stmtStart = false; continue;
    }

    // ---- symbols and literals
    if (t.text === ';') {
      emit(t);
      header = header === 'TRIGGER' ? header : null;
      endStatement(); nl(stmtIndent()); continue;
    }
    if (t.text === '(') {
      const isSub = nx && nx.type === 'word' && (nxUp === 'SELECT' || nxUp === 'WITH');
      emit(t);
      if (isSub) {
        const fr = newFrame(cur.indent + 1); fr.clause = null;
        frames.push(fr); nl(fr.base);
      } else if (header && header !== 'TRIGGER' && atRoot && hasTopLevelComma(toks, i)) {
        const fr = { kind: 'params', base: headerIndent + 1 }; frames.push(fr); nl(fr.base);
      } else frames.push({ kind: 'inline' });
      stmtStart = false; continue;
    }
    if (t.text === ')') {
      const fr = frames.length > 1 ? frames.pop() : null;
      if (fr && (fr.kind === 'stmt' || fr.kind === 'params')) nl(fr.base - 1);
      emit(t); continue;
    }
    if (t.text === ',') {
      const brkList = f.kind === 'params' ? f.base
        : (f.kind === 'stmt' && caseExpr === 0 && LIST_CLAUSES.has(f.clause) && !ctl) ? (f.clause === 'WITH' ? f.base : f.base + 1) : null;
      if (brkList === null) { emit(t); continue; }
      if (o.commaStyle === 'leading') { nl(brkList); emit(t); }
      else { emit(t); nl(brkList); }
      continue;
    }
    if (t.text === '<<' && nx && nx.type === 'word') {
      // <<label>>
      nlIf(stmtIndent());
      const n2 = toks[i + 2];
      if (n2 && n2.text === '>>') { cur.text += '<<' + toks[i + 1].text + '>>'; i += 2; nl(stmtIndent()); last = null; keepStart = true; stmtStart = true; continue; }
    }
    const e = emit(t);
    if ((t.text === '-' || t.text === '+') && (!last || isUnaryContext(toks, i))) e.unary = true;
    stmtStart = false;
  }
  flush();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  // trimming the end also keeps an unterminated string or comment at the end of the text from growing on every run
  const text = lines.map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\s+$/, '');
  return text ? text + '\n' : '';
}

function isUnaryContext(toks, i) {
  const p = prevSig(toks, i);
  if (!p) return true;
  if (p.type === 'op') return p.text !== ')';
  if (p.type === 'word') return UNARY_AFTER.has(p.text.toUpperCase());
  return false;
}

/** Is there a comma directly inside the parenthesis that opens at toks[i]? */
function hasTopLevelComma(toks, i) {
  let d = 0;
  for (let k = i; k < toks.length; k++) {
    const x = toks[k].text;
    if (toks[k].type !== 'op') continue;
    if (x === '(') d++;
    else if (x === ')') { if (--d === 0) return false; }
    else if (x === ',' && d === 1) return true;
    else if (x === ';') return false;
  }
  return false;
}

module.exports = { format, changeCase, sameTokens, DEFAULTS };

'use strict';
// DBMS_XPLAN text parser and plan checks. Pure JS, no VS Code dependency.
// Ported from the Oracle Plan Reader JetBrains plugin (PlanParser / PlanAnalyzer / Report).

const HASH = /Plan hash value:\s*(\d+)/;
const ID_CELL = /^\s*(\*?)\s*(\d+)\s*$/;
const PRED_START = /^\s*(\d+)\s*-\s*(.*)$/;
const NUM = /^(\d+(?:\.\d+)?)\s*([KMGTPE]?)$/;
const COST = /^(\d+(?:\.\d+)?[KMGTPE]?)\s*(?:\((\d+)\))?$/;
const POW = { '': 0, K: 1, M: 2, G: 3, T: 4, P: 5, E: 6 };
const DEFAULTS = { bigRows: 10000, hotPercent: 50 };

/** "123", "10K", "1.5M" -> number; -1 when empty or not a number. */
function number(s) {
  if (s == null) return -1;
  const m = NUM.exec(String(s).trim().toUpperCase());
  if (!m) return -1;
  return Math.round(parseFloat(m[1]) * Math.pow(1000, POW[m[2]]));
}

/** Drops prefixes such as "2026-11-08 10:00:01 DEBUG " or "SQL> " in front of plan table rows. */
function stripLogPrefix(line) {
  const bar = line.indexOf('|');
  if (bar > 0) {
    const before = line.slice(0, bar), rest = line.slice(bar);
    const tableRow = /^\|[ *]*\d+ *\|/.test(rest) || rest.includes('| Operation');
    if (before.trim() && tableRow) return { text: rest, offset: bar };
  }
  return { text: line, offset: 0 };
}

function cells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|');
}

/**
 * Parses DBMS_XPLAN.DISPLAY / DISPLAY_CURSOR / DISPLAY_AWR text (TYPICAL, ALL, ALLSTATS LAST).
 * Every plan line remembers where it is in the text: srcLine (0-based) and opStart/opEnd (columns of the
 * operation text), so editors can decorate it.
 */
function parse(text) {
  const raw = String(text || '').replace(/\r/g, '').split('\n');
  let hash = null, header = null, section = 'plan', predId = null;
  const lines = [], predicates = new Map(), notes = [];
  raw.forEach((line0, srcLine) => {
    const { text: line, offset } = stripLogPrefix(line0);
    const t = line.trim();
    const hm = HASH.exec(line);
    if (hm) hash = hm[1];
    if (t.startsWith('Predicate Information')) { section = 'pred'; predId = null; return; }
    if (t === 'Note') { section = 'note'; return; }
    if (/^(Column Projection Information|Query Block Name|Hint Report|Outline Data|Remote SQL Information|Sql Plan Directive)/.test(t)) { section = 'other'; return; }
    if (t.startsWith('|') && section === 'plan') {
      const cs = cells(line);
      if (!header && cs.some(c => c.trim() === 'Operation')) { header = cs.map(c => c.trim()); return; }
      if (header && cs.length) {
        const im = ID_CELL.exec(cs[0]);
        if (im) lines.push(row(header, cs, im[1] === '*', parseInt(im[2], 10), srcLine, offset + line.indexOf('|') + 1));
      }
      return;
    }
    if (section === 'pred') {
      if (!t || /^-+$/.test(t)) return;
      const pm = PRED_START.exec(line);
      if (pm) {
        predId = parseInt(pm[1], 10);
        if (!predicates.has(predId)) predicates.set(predId, []);
        predicates.get(predId).push(pm[2].trim());
      } else if (predId !== null) {
        const l = predicates.get(predId);
        if (/^(access|filter|storage)\(/.test(t)) l.push(t); else l[l.length - 1] += ' ' + t;
      }
    } else if (section === 'note') {
      if (t.startsWith('-') && !/^-+$/.test(t)) notes.push(t.slice(1).trim());
    }
  });
  linkTree(lines);
  const plan = { planHash: hash, columns: header || [], lines, predicates, notes };
  plan.hasActuals = (header || []).includes('A-Rows');
  plan.root = lines[0] || null;
  plan.line = id => lines.find(l => l.id === id) || null;
  plan.predicatesOf = id => predicates.get(id) || [];
  return plan;
}

function row(header, cs, star, id, srcLine, firstCellCol) {
  const l = { id, depth: 0, hasPredicate: star, operation: '', name: '', rows: -1, bytes: -1, cost: -1, cpuPercent: -1, time: '',
    starts: -1, actualRows: -1, buffers: -1, tempSpace: -1, srcLine, opStart: -1, opEnd: -1, parent: null, children: [] };
  let col = firstCellCol;
  for (let i = 0; i < header.length && i < cs.length; i++) {
    const h = header[i], c = cs[i];
    switch (h) {
      case 'Operation': {
        const lead = c.length - c.trimStart().length;
        l.depth = Math.max(0, lead - 1);
        l.operation = c.trim().replace(/\s+/g, ' ');
        l.opStart = col + lead; l.opEnd = col + c.trimEnd().length;
        break;
      }
      case 'Name': l.name = c.trim(); break;
      case 'Rows': case 'E-Rows': l.rows = number(c); break;
      case 'Bytes': l.bytes = number(c); break;
      case 'Cost (%CPU)': case 'Cost': {
        const m = COST.exec(c.trim());
        if (m) { l.cost = number(m[1]); if (m[2] !== undefined) l.cpuPercent = parseInt(m[2], 10); }
        break;
      }
      case 'Time': case 'A-Time': if (!l.time) l.time = c.trim(); break;
      case 'Starts': l.starts = number(c); break;
      case 'A-Rows': l.actualRows = number(c); break;
      case 'Buffers': l.buffers = number(c); break;
      case 'TempSpc': case 'Used-Tmp': { const v = number(c); if (v > l.tempSpace) l.tempSpace = v; break; }
      default:
    }
    col += c.length + 1;
  }
  return l;
}

function linkTree(lines) {
  const stack = [];
  for (const l of lines) {
    while (stack.length && stack[stack.length - 1].depth >= l.depth) stack.pop();
    if (stack.length) { l.parent = stack[stack.length - 1]; l.parent.children.push(l); }
    stack.push(l);
  }
}

/** Cost of the step alone: its cumulative cost minus the cumulative cost of its direct children. */
function selfCost(l) {
  if (l.cost < 0) return -1;
  let sum = 0;
  for (const c of l.children) if (c.cost > 0) sum += c.cost;
  return Math.max(0, l.cost - sum);
}
const is = (l, op) => l.operation === op || l.operation.startsWith(op + ' ');
const label = l => `${l.id} ${l.operation}${l.name ? ' ' + l.name : ''}`;

/** Actual rows when the plan has them, otherwise the estimate multiplied by starts. */
function effectiveRows(l) {
  if (l.actualRows >= 0) return l.actualRows;
  if (l.rows < 0) return -1;
  return l.rows * Math.max(1, l.starts);
}

function human(v) {
  if (v < 10000) return String(v);
  if (v < 10000000) return Math.round(v / 1000) + 'K';
  if (v < 10000000000) return Math.round(v / 1000000) + 'M';
  return Math.round(v / 1000000000) + 'G';
}

/** Share of the total plan cost spent in this step alone (0-100), or -1 when unknown. */
function selfPercent(plan, l) {
  const total = plan.root ? plan.root.cost : -1;
  const s = selfCost(l);
  return total > 0 && s >= 0 ? Math.round(100 * s / total) : -1;
}

/**
 * Checks. Rules of thumb, so every finding is phrased as something to look at, not as a verdict.
 * PR01 most expensive step, PR02 full scan of many rows, PR03 cartesian join (the free checks of the JetBrains plugin).
 * @returns {{rule:string, severity:'error'|'warning'|'info', lineId:number, title:string, advice:string}[]}
 */
function analyze(plan, opts = {}) {
  const o = Object.assign({}, DEFAULTS, opts);
  const out = [];
  const root = plan.root;
  if (!root) return out;
  const total = root.cost;
  if (total > 0) {
    let hot = null;
    for (const l of plan.lines) if (!hot || selfCost(l) > selfCost(hot)) hot = l;
    if (hot && selfCost(hot) > 0) {
      const pct = Math.round(100 * selfCost(hot) / total);
      out.push({ rule: 'PR01', severity: pct >= o.hotPercent ? 'warning' : 'info', lineId: hot.id,
        title: `Most expensive step: ${label(hot)} (${pct}% of the total cost ${total})`,
        advice: 'Start tuning here. Check its predicates and the access path it uses.' });
    }
  }
  for (const l of plan.lines) {
    const rows = effectiveRows(l);
    if ((is(l, 'TABLE ACCESS FULL') || is(l, 'TABLE ACCESS STORAGE FULL') || is(l, 'MAT_VIEW ACCESS FULL')) && rows >= o.bigRows) {
      out.push({ rule: 'PR02', severity: 'warning', lineId: l.id,
        title: `Full table scan of ${l.name || 'a table'} returning about ${human(rows)} rows`,
        advice: 'Fine when most of the table is needed. Otherwise check for a missing index on the filter columns, or a predicate that prevents index use.' });
    }
    if (l.operation.includes('CARTESIAN')) {
      out.push({ rule: 'PR03', severity: 'error', lineId: l.id, title: `Cartesian product at ${label(l)}`,
        advice: 'Usually a missing join condition. If intended (very small row sources) it is fine; otherwise add the join predicate between the two tables.' });
    }
  }
  return out;
}

/** Worst severity per plan line id. */
function worstByLine(findings) {
  const rank = { error: 0, warning: 1, info: 2 };
  const m = new Map();
  for (const f of findings) if (!m.has(f.lineId) || rank[f.severity] < rank[m.get(f.lineId)]) m.set(f.lineId, f.severity);
  return m;
}

/** Quick test: does the text contain a DBMS_XPLAN plan table? */
const looksLikePlan = text => /\|\s*Id\s*\|\s*Operation\s*\|/.test(text);

module.exports = { parse, analyze, number, stripLogPrefix, selfCost, selfPercent, effectiveRows, human, label, worstByLine, looksLikePlan, DEFAULTS };

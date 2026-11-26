'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parse, analyze, number, selfCost, selfPercent, effectiveRows, human, looksLikePlan, stripLogPrefix } = require('../src/core');
const { explain, OPS } = require('../src/operations');
const { html } = require('../src/report');
const { TYPICAL, ALLSTATS } = require('./samples');

test('parses a TYPICAL plan', () => {
  const p = parse(TYPICAL);
  assert.strictEqual(p.planHash, '3254851382');
  assert.strictEqual(p.lines.length, 7);
  const six = p.line(6);
  assert.strictEqual(six.operation, 'TABLE ACCESS FULL');
  assert.strictEqual(six.name, 'ORDERS');
  assert.strictEqual(six.rows, 1500000);
  assert.strictEqual(six.cost, 20000);
  assert.strictEqual(six.cpuPercent, 2);
  assert.strictEqual(six.tempSpace, -1);
  assert.strictEqual(p.line(1).tempSpace, 45000000);
  assert.ok(six.hasPredicate);
  assert.strictEqual(six.parent.id, 1);
  assert.strictEqual(six.depth, 2);
  assert.deepStrictEqual(p.line(1).children.map(l => l.id), [2, 6]);
  assert.deepStrictEqual(p.predicatesOf(6), ['filter(TO_NUMBER("O"."CUST_CODE")=42 AND UPPER("O"."STATUS")=\'OPEN\')']);
  assert.deepStrictEqual(p.notes, ['dynamic statistics used: dynamic sampling (level=2)']);
  assert.ok(!p.hasActuals);
});

test('source positions point at the operation text', () => {
  const p = parse(TYPICAL);
  const src = TYPICAL.split('\n');
  for (const l of p.lines) assert.strictEqual(src[l.srcLine].slice(l.opStart, l.opEnd), l.operation, String(l.id));
});

test('self cost and percentages', () => {
  const p = parse(TYPICAL);
  assert.strictEqual(selfCost(p.line(6)), 20000);
  assert.strictEqual(selfCost(p.line(1)), 21000 - 6 - 20000);
  assert.strictEqual(selfPercent(p, p.line(6)), 95);
});

test('free checks on the TYPICAL plan', () => {
  const f = analyze(parse(TYPICAL));
  const byRule = r => f.filter(x => x.rule === r);
  assert.deepStrictEqual(byRule('PR01').map(x => [x.lineId, x.severity]), [[6, 'warning']]);
  assert.deepStrictEqual(byRule('PR02').map(x => x.lineId), [6]); // DEPT/REGIONS are tiny
  assert.deepStrictEqual(byRule('PR03').map(x => [x.lineId, x.severity]), [[2, 'error']]);
  assert.match(byRule('PR02')[0].title, /about 1500K rows/);
});

test('thresholds are configurable', () => {
  assert.strictEqual(analyze(parse(TYPICAL), { bigRows: 2000000 }).filter(x => x.rule === 'PR02').length, 0);
  assert.strictEqual(analyze(parse(TYPICAL), { hotPercent: 99 }).find(x => x.rule === 'PR01').severity, 'info');
});

test('ALLSTATS plan uses actual rows', () => {
  const p = parse(ALLSTATS);
  assert.ok(p.hasActuals);
  assert.strictEqual(p.line(3).starts, 50000);
  assert.strictEqual(effectiveRows(p.line(2)), 50000);
  assert.deepStrictEqual(analyze(p).filter(x => x.rule === 'PR02').map(x => x.lineId), [2]);
});

test('log prefixes are stripped and positions still match', () => {
  const logged = TYPICAL.split('\n').map(l => l.startsWith('|') ? '2026-11-08 10:00:01 DEBUG ' + l : l).join('\n');
  const p = parse(logged);
  assert.strictEqual(p.lines.length, 7);
  const src = logged.split('\n');
  for (const l of p.lines) assert.strictEqual(src[l.srcLine].slice(l.opStart, l.opEnd), l.operation);
  assert.deepStrictEqual(stripLogPrefix('SQL> hello'), { text: 'SQL> hello', offset: 0 });
});

test('numbers', () => {
  assert.strictEqual(number('10K'), 10000);
  assert.strictEqual(number(' 1.5M '), 1500000);
  assert.strictEqual(number(''), -1);
  assert.strictEqual(number('abc'), -1);
  assert.strictEqual(human(1500000), '1500K');
  assert.strictEqual(human(25000000), '25M');
});

test('no plan', () => {
  assert.ok(!looksLikePlan('select 1 from dual'));
  assert.ok(looksLikePlan(TYPICAL));
  const p = parse('nothing here');
  assert.strictEqual(p.lines.length, 0);
  assert.deepStrictEqual(analyze(p), []);
  assert.match(html(p, []), /No plan table found/);
});

test('operation explanations use the longest prefix', () => {
  assert.strictEqual(explain('TABLE ACCESS BY INDEX ROWID BATCHED').key, 'TABLE ACCESS BY INDEX ROWID BATCHED');
  assert.strictEqual(explain('INDEX RANGE SCAN DESCENDING').key, 'INDEX RANGE SCAN DESCENDING');
  assert.strictEqual(explain('HASH JOIN RIGHT OUTER').key, 'HASH JOIN RIGHT OUTER');
  assert.strictEqual(explain('NESTED LOOPS  OUTER').key, 'NESTED LOOPS OUTER');
  assert.strictEqual(explain('PX SEND HASH (BLOCK ADDRESS)').key, 'PX SEND HASH');
  assert.strictEqual(explain('SOMETHING NEW'), null);
  assert.ok(Object.keys(OPS).length > 80);
  for (const l of parse(TYPICAL).lines.concat(parse(ALLSTATS).lines)) assert.ok(explain(l.operation), l.operation);
});

test('HTML report escapes and links', () => {
  const p = parse(TYPICAL);
  const out = html(p, analyze(p), line => `command:x?${line}`);
  assert.match(out, /7 steps<\/b>, plan hash 3254851382, total cost 21000/);
  assert.match(out, /=&#39;OPEN&#39;/);
  assert.ok(!out.includes("='OPEN'"));
  assert.match(out, /href="command:x\?\d+"/);
  assert.ok(!/<script/i.test(out));
});

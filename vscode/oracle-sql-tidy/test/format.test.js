'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { format, changeCase, sameTokens } = require('../src/format');
const { tokenize } = require('../src/lexer');
const samples = require('./samples');

const strip = s => s.replace(/\s+/g, '');
const OPTION_SETS = [
  {},
  { keywordCase: 'lower' },
  { keywordCase: 'preserve' },
  { commaStyle: 'leading' },
  { indentSize: 2, maxLineWidth: 40 },
  { keywordCase: 'lower', commaStyle: 'leading', indentSize: 3, maxLineWidth: 60 },
  { useTabs: true, maxLineWidth: 30 },
];

for (const [name, src] of Object.entries(samples)) {
  test(`${name}: no character other than whitespace changes (keywordCase preserve)`, () => {
    for (const extra of [{}, { commaStyle: 'leading' }, { maxLineWidth: 30 }, { indentSize: 2, baseIndent: '    ' }]) {
      const out = format(src, Object.assign({ keywordCase: 'preserve' }, extra));
      assert.strictEqual(strip(out), strip(src), JSON.stringify(extra));
    }
  });
  test(`${name}: same tokens in the same order with every option set`, () => {
    for (const o of OPTION_SETS) {
      const out = format(src, o);
      assert.ok(sameTokens(src, out), JSON.stringify(o));
      assert.strictEqual(strip(out).toUpperCase(), strip(src).toUpperCase(), JSON.stringify(o));
    }
  });
  test(`${name}: formatting is idempotent`, () => {
    for (const o of OPTION_SETS) {
      const once = format(src, o);
      assert.strictEqual(format(once, o), once, JSON.stringify(o));
    }
  });
}

test('comments, strings, q-quotes and terminators survive verbatim', () => {
  const out = format(samples.quotes + samples.terminators + samples.sqlplus);
  for (const s of ["q'{a 'b' c}'", "q'<x>'", "nq'!multi\nline!'", "'it''s'", '"Mixed Case Col"', "'a  --  not a comment'",
    "'line one\n   line two with   spaces   '", '/* trailing block */', '@@other_script.sql', 'set serveroutput on', 'prompt Creating things'])
    assert.ok(out.includes(s), s);
  assert.strictEqual(out.split('\n').filter(l => l === '/').length, 3);
  assert.ok(out.includes('10 / 2'));
});

test('keyword case options', () => {
  assert.strictEqual(format('select Count(*) from dual;'), 'SELECT COUNT(*)\nFROM dual;\n');
  assert.strictEqual(format('SELECT COUNT(*) FROM DUAL;', { keywordCase: 'lower' }), 'select count(*)\nfrom DUAL;\n');
  assert.strictEqual(format('Select a From t;', { keywordCase: 'preserve' }), 'Select a\nFrom t;\n');
  assert.strictEqual(changeCase('select x.select from t x;'), 'SELECT x.select FROM t x;');
});

test('leading and trailing commas', () => {
  assert.strictEqual(format('select a, b from t;'), 'SELECT a,\n    b\nFROM t;\n');
  assert.strictEqual(format('select a, b from t;', { commaStyle: 'leading', indentSize: 2 }), 'SELECT a\n  , b\nFROM t;\n');
});

test('PL/SQL block structure is indented', () => {
  const out = format('begin if x then y := 1; else y := 2; end if; end;');
  assert.strictEqual(out, 'BEGIN\n    IF x THEN\n        y := 1;\n    ELSE\n        y := 2;\n    END IF;\nEND;\n');
});

test('a comment after code stays on that line', () => {
  assert.strictEqual(format('x := 1; -- note\ny := 2;'), 'x := 1; -- note\ny := 2;\n');
});

test('soft line width wraps long lines without splitting tokens', () => {
  const src = "begin raise_application_error(-20001, 'a long message here ' || v_name || ' and more text', true); end;";
  const out = format(src, { maxLineWidth: 50 });
  assert.ok(out.split('\n').length > 3);
  assert.ok(sameTokens(src, out));
  assert.strictEqual(format(out, { maxLineWidth: 50 }), out);
});

test('baseIndent prefixes every formatted line', () => {
  assert.strictEqual(format('select a from t;', { baseIndent: '  ' }), '  SELECT a\n  FROM t;\n');
});

test('SQL*Plus commands are recognised only where a command can start', () => {
  const types = tokenize('select a,\nhost\nfrom t;\nhost ls').map(t => t.type);
  assert.deepStrictEqual(types.slice(0, 4), ['word', 'word', 'op', 'word']);
  assert.strictEqual(types[types.length - 1], 'sqlplus');
});

test('sameTokens detects a lost or changed token', () => {
  assert.ok(sameTokens('select a from t', 'SELECT  a\nFROM t'));
  assert.ok(!sameTokens('select a from t', 'select from t'));
  assert.ok(!sameTokens("select 'a b' from t", "select 'a  b' from t"));
});

test('random fragments: never lose a token, always idempotent', () => {
  const lines = Object.values(samples).join('\n').split('\n');
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let it = 0; it < 3000; it++) {
    let src = '';
    for (let k = 1 + rnd(10); k > 0; k--) src += lines[rnd(lines.length)] + '\n';
    const o = OPTION_SETS[it % OPTION_SETS.length];
    const out = format(src, o);
    assert.ok(sameTokens(src, out), JSON.stringify(src));
    assert.strictEqual(format(out, o), out, JSON.stringify(src));
  }
});

test('unterminated string at the end does not grow', () => {
  const src = "select 'abc\n";
  const once = format(src);
  assert.strictEqual(format(once), once);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { lint, RULES } = require('../src/core');
const cases = require('./parity.json');

test('15 rules ported', () => assert.strictEqual(Object.keys(RULES).length, 15));

test('parity with the Python plsql-lint reference', () => {
  for (const c of cases) {
    const got = lint(c.src, c.select ? { select: c.select, maxLineLength: c.max } : {});
    assert.deepStrictEqual(got, c.out, c.src.slice(0, 80));
  }
});

test('noqa suppresses a line', () => {
  assert.strictEqual(lint('SELECT * FROM t; -- noqa: PLL002\n').length, 0);
  assert.strictEqual(lint('SELECT * FROM t;\n').length, 1);
});

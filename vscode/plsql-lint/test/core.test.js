'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { lint, RULES } = require('../src/core');
const cases = require('./parity.json');

const PORTED = Array.from({ length: 15 }, (_, i) => `PLL0${String(i + 1).padStart(2, '0')}`);
const codesOf = (src, cfg) => lint(src, cfg).map(f => f.code);
const only = (code, src) => lint(src, { select: [code], fixes: true });

/** Applies a single-line fix the way the VS Code quick fix does. */
function applyFix(src, fix) {
  const lines = src.split('\n');
  const l = lines[fix.line - 1];
  lines[fix.line - 1] = l.slice(0, fix.col - 1) + fix.text + l.slice(fix.col - 1 + fix.length);
  return lines.join('\n');
}

test('15 ported rules + 4 VS Code rules', () => {
  assert.strictEqual(Object.keys(RULES).length, 19);
  for (const c of ['PLL021', 'PLL022', 'PLL023', 'PLL024']) assert.ok(RULES[c], c);
});

test('parity with the Python plsql-lint reference', () => {
  for (const c of cases) {
    const got = lint(c.src, c.select ? { select: c.select, maxLineLength: c.max } : { select: PORTED.filter(x => x !== 'PLL009') });
    assert.deepStrictEqual(got, c.out, c.src.slice(0, 80));
  }
});

test('noqa suppresses a line', () => {
  assert.strictEqual(lint('SELECT * FROM t; -- noqa: PLL002\n').length, 0);
  assert.strictEqual(lint('SELECT * FROM t;\n').length, 1);
  assert.strictEqual(lint('BEGIN\n  CASE x WHEN 1 THEN y := 1; END CASE; -- noqa: PLL021\nEND;').filter(f => f.code === 'PLL021').length, 0);
});

test('fixes are only returned when asked for', () => {
  assert.strictEqual(lint('DECLARE v VARCHAR(10); BEGIN NULL; END;')[0].fix, undefined);
  assert.ok(lint('DECLARE v VARCHAR(10); BEGIN NULL; END;', { fixes: true })[0].fix);
});

test('PLL021 case-without-else', () => {
  const bad = 'BEGIN\n  CASE l_status\n    WHEN 1 THEN do_a;\n    WHEN 2 THEN do_b;\n  END CASE;\nEND;';
  const f = only('PLL021', bad);
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].line, 2);
  const fixed = applyFix(bad, f[0].fix);
  assert.match(fixed, /ELSE NULL; END CASE;/);
  assert.strictEqual(only('PLL021', fixed).length, 0);
  // searched CASE statement
  assert.strictEqual(only('PLL021', 'BEGIN CASE WHEN a > 1 THEN x; END CASE; END;').length, 1);
  // with ELSE
  assert.strictEqual(only('PLL021', 'BEGIN CASE x WHEN 1 THEN a; ELSE b; END CASE; END;').length, 0);
  // CASE expressions without ELSE return NULL: fine
  assert.strictEqual(only('PLL021', "SELECT CASE WHEN a = 1 THEN 'x' END FROM t;").length, 0);
  assert.strictEqual(only('PLL021', "BEGIN v := CASE x WHEN 1 THEN 'a' END; END;").length, 0);
  // ELSE belongs to a nested IF, not to the CASE
  assert.strictEqual(only('PLL021', 'BEGIN CASE x WHEN 1 THEN IF a THEN b; ELSE c; END IF; END CASE; END;').length, 1);
  // nested CASE expression with ELSE inside a CASE statement without ELSE
  assert.strictEqual(only('PLL021', "BEGIN CASE x WHEN 1 THEN v := CASE WHEN y THEN 1 ELSE 2 END; END CASE; END;").length, 1);
});

test('PLL022 sqlcode-in-sql', () => {
  const bad = "EXCEPTION WHEN OTHERS THEN\n  INSERT INTO err_log (code, msg) VALUES (SQLCODE, SQLERRM);\n  RAISE;";
  assert.deepStrictEqual(only('PLL022', bad).map(f => f.col), [43, 52]);
  assert.strictEqual(only('PLL022', 'EXCEPTION WHEN OTHERS THEN l_code := SQLCODE; l_msg := SQLERRM; INSERT INTO err_log VALUES (l_code, l_msg); RAISE;').length, 0);
  assert.strictEqual(only('PLL022', "UPDATE t SET msg = SUBSTR(SQLERRM, 1, 200) WHERE id = 1;").length, 1);
  // cursor FOR loop: the SELECT ends at ')', SQLERRM in the loop body is PL/SQL
  assert.strictEqual(only('PLL022', 'BEGIN FOR r IN (SELECT id FROM t) LOOP log(SQLERRM); END LOOP; END;').length, 0);
  assert.strictEqual(only('PLL022', "SELECT 'SQLERRM' FROM dual;").length, 0);
});

test('PLL023 bulk-fetch-notfound', () => {
  const bad = 'LOOP\n  FETCH c BULK COLLECT INTO l_rows LIMIT 100;\n  EXIT WHEN c%NOTFOUND;\n  process(l_rows);\nEND LOOP;';
  const f = only('PLL023', bad);
  assert.strictEqual(f.length, 1); assert.deepStrictEqual([f[0].line, f[0].col], [3, 13]);
  const fixed = applyFix(bad, f[0].fix);
  assert.match(fixed, /EXIT WHEN l_rows\.COUNT = 0;/);
  assert.strictEqual(only('PLL023', fixed).length, 0);
  // no LIMIT: one fetch gets everything, %NOTFOUND is fine
  assert.strictEqual(only('PLL023', 'FETCH c BULK COLLECT INTO l_rows; EXIT WHEN c%NOTFOUND;').length, 0);
  // plain FETCH: the classic pattern is correct
  assert.strictEqual(only('PLL023', 'FETCH c INTO r; EXIT WHEN c%NOTFOUND;').length, 0);
  // EXIT after processing is fine
  assert.strictEqual(only('PLL023', 'FETCH c BULK COLLECT INTO l_rows LIMIT 100; process(l_rows); EXIT WHEN c%NOTFOUND;').length, 0);
  // several INTO targets: reported, no automatic fix
  const m = only('PLL023', 'FETCH c BULK COLLECT INTO l_ids, l_names LIMIT 500; EXIT WHEN c%NOTFOUND;');
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].fix, undefined);
});

test('PLL024 commit-in-trigger', () => {
  const bad = 'CREATE OR REPLACE TRIGGER trg_audit\nAFTER INSERT ON orders FOR EACH ROW\nBEGIN\n  INSERT INTO audit_log VALUES (:new.id, SYSDATE);\n  COMMIT;\nEND;\n/\n';
  const f = only('PLL024', bad);
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].line, 5);
  assert.strictEqual(only('PLL024', bad.replace('BEGIN', 'DECLARE\n  PRAGMA AUTONOMOUS_TRANSACTION;\nBEGIN')).length, 0);
  assert.strictEqual(only('PLL024', 'CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW BEGIN SAVEPOINT a; ROLLBACK TO a; END;\n/').length, 0);
  // a procedure after the trigger is not part of it
  assert.strictEqual(only('PLL024', 'CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW BEGIN NULL; END;\n/\nCREATE PROCEDURE p IS BEGIN COMMIT; END;\n/').length, 0);
});

test('quick fixes for PLL004, PLL012 and PLL013', () => {
  let src = 'IF x = NULL THEN y := 1; END IF;';
  assert.strictEqual(applyFix(src, only('PLL004', src)[0].fix), 'IF x IS NULL THEN y := 1; END IF;');
  src = "WHERE name <> ''";
  assert.strictEqual(applyFix(src, only('PLL012', src)[0].fix), 'WHERE name IS NOT NULL');
  src = 'v varchar(10);';
  assert.strictEqual(applyFix(src, only('PLL013', src)[0].fix), 'v varchar2(10);');
  // NULL on the left side: reported, no fix
  assert.strictEqual(only('PLL004', 'IF NULL = x THEN').filter(f => f.fix).length, 0);
});

test('new rules on by default', () => {
  assert.ok(codesOf('BEGIN CASE x WHEN 1 THEN a; END CASE; END;').includes('PLL021'));
});

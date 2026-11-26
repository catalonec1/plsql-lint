'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { load, scan } = require('../src/catalog');

test('catalog loads 251 errors with all fields', () => {
  const c = load();
  assert.strictEqual(c.size, 251);
  for (const e of c.values()) assert.ok(e.title && e.cause && e.action && e.url.endsWith(`/${e.code}/`), e.code);
});

test('scan finds and normalizes codes', () => {
  const hits = scan('ORA-06512: at line 4\nora 1403 and PLS-00201, TNS-12541; ORA-1');
  assert.deepStrictEqual(hits.map(h => h.code), ['ORA-06512', 'ORA-01403', 'PLS-00201', 'TNS-12541', 'ORA-00001']);
});

test('common codes are in the catalog', () => {
  const c = load();
  for (const k of ['ORA-00001', 'ORA-01403', 'ORA-00942', 'ORA-06512']) assert.ok(c.has(k), k);
});

test('markdownDoc is self-contained Markdown', () => {
  const { markdownDoc } = require('../src/catalog');
  const e = load().get('ORA-01403');
  const md = markdownDoc(e);
  assert.ok(md.startsWith('### ORA-01403: '));
  assert.ok(md.includes(`**Cause:** ${e.cause}`) && md.includes(`**Fix:** ${e.action}`) && md.includes(e.url));
});

test('pushRecent keeps most recent first without duplicates', () => {
  const { pushRecent } = require('../src/catalog');
  assert.deepStrictEqual(pushRecent(['A', 'B', 'C'], 'B'), ['B', 'A', 'C']);
  assert.deepStrictEqual(pushRecent(undefined, 'A'), ['A']);
  assert.deepStrictEqual(pushRecent(['A', 'B', 'C'], 'D', 3), ['D', 'A', 'B']);
});

test('isLogFile', () => {
  const { isLogFile } = require('../src/catalog');
  assert.ok(isLogFile('log', 'x.txt'));
  assert.ok(isLogFile('plaintext', '/var/app/alert_orcl.log'));
  assert.ok(isLogFile('plaintext', 'orcl_ora_1234.trc'));
  assert.ok(isLogFile('plaintext', 'server.log.3'));
  assert.ok(!isLogFile('sql', 'query.sql'));
});

'use strict';
// Runs the extension against a minimal mock of the vscode API.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

class Range {
  constructor(a, b, c, d) {
    if (typeof a === 'object') { this.start = a; this.end = b; } else { this.start = { line: a, character: b }; this.end = { line: c, character: d }; }
  }
}
const reg = { cmds: {} };
const warnings = [];
const vscode = {
  Range, EndOfLine: { LF: 1, CRLF: 2 },
  TextEdit: { replace: (range, newText) => ({ range, newText }) },
  languages: {
    registerDocumentFormattingEditProvider: (s, p) => { reg.doc = p; reg.selector = s; return { dispose() {} }; },
    registerDocumentRangeFormattingEditProvider: (s, p) => { reg.range = p; return { dispose() {} }; }
  },
  commands: { registerCommand: (n, f) => { reg.cmds[n] = f; return { dispose() {} }; } },
  workspace: { getConfiguration: () => ({ get: (k, d) => (k in settings ? settings[k] : d) }) },
  window: { showWarningMessage: m => warnings.push(m), setStatusBarMessage: () => {} }
};
let settings = {};
const load = Module._load;
Module._load = function (r, ...a) { return r === 'vscode' ? vscode : load.call(this, r, ...a); };
const ext = require('../src/extension');
ext.activate({ subscriptions: [] });

function doc(text, eol = 1) {
  const lines = text.split('\n');
  const offsets = [0];
  for (const l of lines) offsets.push(offsets[offsets.length - 1] + l.length + 1);
  const off = p => offsets[p.line] + p.character;
  return {
    eol,
    getText: r => (r ? text.slice(off(r.start), off(r.end)) : text),
    positionAt: o => { let line = 0; while (offsets[line + 1] <= o && line < lines.length - 1) line++; return { line, character: o - offsets[line] }; },
    lineAt: i => ({ text: lines[i], range: new Range(i, 0, i, lines[i].length) })
  };
}

test('registers both providers for SQL and PL/SQL files', () => {
  assert.ok(reg.doc && reg.range && reg.cmds['oracleSqlTidy.format']);
  assert.ok(reg.selector.some(s => s.language === 'plsql') && reg.selector.some(s => s.language === 'sql'));
  assert.ok(reg.selector.some(s => s.pattern && s.pattern.includes('pkb')));
});

test('document formatting uses the settings and the editor tab size', () => {
  settings = { keywordCase: 'lower', commaStyle: 'leading' };
  const [e] = reg.doc.provideDocumentFormattingEdits(doc('SELECT a, b FROM t;'), { tabSize: 2, insertSpaces: true });
  assert.strictEqual(e.newText, 'select a\n  , b\nfrom t;\n');
  settings = {};
});

test('CRLF documents stay CRLF', () => {
  const [e] = reg.doc.provideDocumentFormattingEdits(doc('select a from t;', 2), { tabSize: 4, insertSpaces: true });
  assert.strictEqual(e.newText, 'SELECT a\r\nFROM t;\r\n');
});

test('range formatting keeps the indentation of the first selected line', () => {
  const d = doc('begin\n    select a into x from t;\nend;\n');
  const [e] = reg.range.provideDocumentRangeFormattingEdits(d, new Range(1, 3, 1, 10), { tabSize: 4, insertSpaces: true });
  assert.deepStrictEqual([e.range.start.line, e.range.end.line], [1, 1]);
  assert.strictEqual(e.newText, '    SELECT a\n    INTO x\n    FROM t;');
});

test('already formatted text gives no edits', () => {
  assert.deepStrictEqual(reg.doc.provideDocumentFormattingEdits(doc('SELECT a\nFROM t;\n'), { tabSize: 4, insertSpaces: true }), []);
  assert.strictEqual(warnings.length, 0);
});

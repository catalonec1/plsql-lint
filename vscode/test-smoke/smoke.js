'use strict';
// Activates both extensions against a minimal mock of the vscode API.
const Module = require('module');
const assert = require('assert');
const reg = { cmds: {}, hover: null, diags: new Map(), actions: null };
class Range { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } }
const doc = (text, languageId) => {
  const lines = text.split('\n');
  return { uri: { toString: () => 'file:///a.sql' }, languageId, getText: () => text, lineCount: lines.length,
    lineAt: i => ({ text: lines[i], range: new Range(i, 0, i, lines[i].length) }) };
};
const vscode = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
  Range, Selection: Range, Hover: class { constructor(c, r) { this.contents = c; this.range = r; } },
  MarkdownString: class { constructor(v) { this.value = v; } },
  Diagnostic: class { constructor(r, m, s) { this.range = r; this.message = m; this.severity = s; } },
  CodeAction: class { constructor(t) { this.title = t; } }, CodeActionKind: { QuickFix: 'qf' },
  WorkspaceEdit: class { insert(u, p, t) { this.t = t; } },
  Uri: { parse: s => s }, ViewColumn: { Beside: 2 },
  languages: {
    createDiagnosticCollection: () => ({ set: (u, d) => reg.diags.set(u.toString(), d), delete: () => {}, dispose() {} }),
    registerCodeActionsProvider: (s, p) => (reg.actions = p),
    registerHoverProvider: (s, p) => (reg.hover = p)
  },
  workspace: { getConfiguration: () => ({ get: (k, d) => d }), onDidOpenTextDocument: () => {}, onDidChangeTextDocument: () => {},
    onDidCloseTextDocument: () => {}, onDidChangeConfiguration: () => {}, textDocuments: [] },
  commands: { registerCommand: (n, f) => (reg.cmds[n] = f), executeCommand: () => {} },
  window: {}, env: { openExternal: () => {} }
};
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'vscode' ? vscode : orig.call(this, req, ...a); };

const lint = require('../plsql-lint/src/extension.js');
const d = doc("BEGIN\n  IF x = NULL THEN NULL; END IF;\nEXCEPTION WHEN OTHERS THEN NULL;\nEND;", 'plsql');
vscode.workspace.textDocuments = [d];
lint.activate({ subscriptions: [] });
const got = reg.diags.get('file:///a.sql');
assert.deepStrictEqual(got.map(x => x.code.value), ['PLL004', 'PLL001']);
assert.strictEqual(got[0].range.start.line, 1);
const acts = reg.actions.provideCodeActions(d, null, { diagnostics: got.map(g => Object.assign(g, { source: 'plsql-lint' })) });
assert.strictEqual(acts[0].edit.t, ' -- noqa: PLL004');
for (const c of ['plsqlLint.lintFile', 'plsqlLint.openPro', 'plsqlLint.openOraReference', 'plsqlLint.openBook']) assert.ok(reg.cmds[c], c);

const ora = require('../ora-error-helper/src/extension.js');
ora.activate({ subscriptions: [] });
const h = reg.hover.provideHover(doc('java.sql.SQLException: ORA-00942: table or view does not exist', 'log'), { line: 0, character: 30 });
assert.ok(h.contents.value.includes('ORA-00942') && h.contents.value.includes('/ora/ORA-00942/'));
assert.strictEqual(reg.hover.provideHover(doc('no codes here', 'log'), { line: 0, character: 3 }), undefined);
for (const c of ['oraErrors.explain', 'oraErrors.browse', 'oraErrors.scanFile', 'oraErrors.openReference']) assert.ok(reg.cmds[c], c);
console.log('smoke ok');

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
  WorkspaceEdit: class { insert(u, p, t) { this.t = t; } replace(u, r, t) { this.r = r; this.t = t; } },
  EventEmitter: class { constructor() { this.event = () => {}; } fire() {} dispose() {} },
  CodeLens: class { constructor(r, c) { this.range = r; this.command = c; } },
  Uri: { parse: s => s }, ViewColumn: { Beside: 2 },
  languages: {
    createDiagnosticCollection: () => ({ set: (u, d) => reg.diags.set(u.toString(), d), delete: () => {}, dispose() {} }),
    registerCodeActionsProvider: (s, p) => (reg.actions = p),
    registerHoverProvider: (s, p) => (reg.hover = p),
    registerDocumentLinkProvider: (s, p) => (reg.links = p),
    registerCodeLensProvider: (s, p) => (reg.lens = p)
  },
  workspace: { getConfiguration: () => ({ get: (k, d) => d }), onDidOpenTextDocument: () => {}, onDidChangeTextDocument: () => {},
    onDidCloseTextDocument: () => {}, onDidChangeConfiguration: () => {}, textDocuments: [] },
  commands: { registerCommand: (n, f) => (reg.cmds[n] = f), executeCommand: () => {} },
  DocumentLink: class { constructor(r, t) { this.range = r; this.target = t; } }, StatusBarAlignment: { Right: 2 },
  window: { createStatusBarItem: () => (reg.bar = { show() { this.shown = true; }, hide() { this.shown = false; }, dispose() {} }), onDidChangeActiveTextEditor: () => {},
    registerTerminalLinkProvider: p => (reg.term = p), createWebviewPanel: (id, title, col, opts) => (reg.panelCount = (reg.panelCount || 0) + 1, reg.panel = { title, opts, webview: {}, reveal() {}, onDidDispose() {} }),
    showInformationMessage: m => (reg.info = m) }, env: { openExternal: () => {}, clipboard: { writeText: async t => (reg.clip = t), readText: async () => '' } }
};
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'vscode' ? vscode : orig.call(this, req, ...a); };

const lint = require('../plsql-lint/src/extension.js');
const d = doc("BEGIN\n  IF x = NULL THEN NULL; END IF;\nEXCEPTION WHEN OTHERS THEN NULL;\nEND;", 'plsql');
const d2 = Object.assign(doc("BEGIN\n  CASE v WHEN 1 THEN a; END CASE;\nEND;", 'plsql'), { uri: { toString: () => 'file:///b.sql' } });
vscode.workspace.textDocuments = [d, d2];
lint.activate({ subscriptions: [] });
const got = reg.diags.get('file:///a.sql');
assert.deepStrictEqual(got.map(x => x.code.value), ['PLL004', 'PLL001']);
assert.strictEqual(got[0].range.start.line, 1);
const acts = reg.actions.provideCodeActions(d, null, { diagnostics: got.map(g => Object.assign(g, { source: 'plsql-lint' })) });
assert.strictEqual(acts[0].title, 'Use IS [NOT] NULL (PLL004)');
assert.strictEqual(acts[0].edit.t, 'IS NULL');
assert.deepStrictEqual([acts[0].edit.r.start.character, acts[0].edit.r.end.character], [7, 13]);
assert.strictEqual(acts[1].edit.t, ' -- noqa: PLL004');
const got2 = reg.diags.get('file:///b.sql');
assert.deepStrictEqual(got2.map(x => x.code.value), ['PLL021']);
const acts2 = reg.actions.provideCodeActions(d2, null, { diagnostics: got2.map(g => Object.assign(g, { source: 'plsql-lint' })) });
assert.strictEqual(acts2[0].edit.t, 'ELSE NULL; ');
for (const c of ['plsqlLint.lintFile', 'plsqlLint.openPro', 'plsqlLint.openOraReference', 'plsqlLint.openBook']) assert.ok(reg.cmds[c], c);

const ora = require('../ora-error-helper/src/extension.js');
const store = new Map();
ora.activate({ subscriptions: [], globalState: { get: (k, d) => (store.has(k) ? store.get(k) : d), update: async (k, v) => store.set(k, v) } });
const h = reg.hover.provideHover(doc('java.sql.SQLException: ORA-00942: table or view does not exist', 'log'), { line: 0, character: 30 });
assert.ok(h.contents.value.includes('ORA-00942') && h.contents.value.includes('/ora/ORA-00942/'));
assert.strictEqual(reg.hover.provideHover(doc('no codes here', 'log'), { line: 0, character: 3 }), undefined);
for (const c of ['oraErrors.explain', 'oraErrors.browse', 'oraErrors.scanFile', 'oraErrors.openReference']) assert.ok(reg.cmds[c], c);
const links = reg.links.provideDocumentLinks(doc('x\nfailed: ORA-01403 and PLS-00201 and ORA-99999', 'log'));
assert.deepStrictEqual(links.map(l => l.range.start.character), [8, 22]);
assert.ok(decodeURIComponent(links[0].target).includes('oraErrors.show?["ORA-01403"]'));
const tl = reg.term.provideTerminalLinks({ line: 'ERROR at line 1: ORA-00942: table or view does not exist' });
assert.strictEqual(tl.length, 1); assert.strictEqual(tl[0].startIndex, 17);
reg.term.handleTerminalLink(tl[0]); assert.strictEqual(reg.panel.title, 'ORA-00942');
reg.cmds['oraErrors.show']('ORA-01403'); assert.strictEqual(reg.panel.title, 'ORA-01403');
// 1.2.0: one reused panel with history, copy as Markdown, CodeLens in logs
assert.strictEqual(reg.panelCount, 1);
assert.ok(reg.panel.opts.enableCommandUris && !reg.panel.opts.enableScripts);
assert.ok(reg.panel.webview.html.includes('Recently viewed') && reg.panel.webview.html.includes('ORA-00942'));
assert.deepStrictEqual(store.get('oraErrors.recent'), ['ORA-01403', 'ORA-00942']);
const h2 = reg.hover.provideHover(doc('ORA-00942', 'log'), { line: 0, character: 2 });
assert.ok(h2.contents.value.includes('command:oraErrors.copyMarkdown') && h2.contents.isTrusted);
for (const c of ['oraErrors.copyMarkdown', 'oraErrors.history', 'oraErrors.clearHistory']) assert.ok(reg.cmds[c], c);
const logDoc = Object.assign(doc('start\nORA-00942 and ORA-00942 again\nok\nPLS-00201', 'log'), { fileName: '/x/app.log' });
assert.deepStrictEqual(reg.lens.provideCodeLenses(logDoc).map(l => [l.range.start.line, l.command.arguments[0]]), [[1, 'ORA-00942'], [3, 'PLS-00201']]);
assert.strictEqual(reg.lens.provideCodeLenses(Object.assign(doc('ORA-00942', 'sql'), { fileName: '/x/a.sql' })).length, 0);
(async () => {
  await reg.cmds['oraErrors.copyMarkdown']('ORA-00942');
  assert.ok(reg.clip.startsWith('### ORA-00942: ') && reg.clip.includes('**Fix:**'));
  reg.cmds['oraErrors.clearHistory'](); assert.deepStrictEqual(store.get('oraErrors.recent'), []);
  console.log('smoke ok');
})().catch(e => { console.error(e); process.exit(1); });

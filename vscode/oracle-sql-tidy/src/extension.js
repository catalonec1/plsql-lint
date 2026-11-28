'use strict';
const vscode = require('vscode');
const { format, sameTokens } = require('./format');

const SELECTOR = [
  { language: 'plsql' }, { language: 'sql' }, { language: 'oraclesql' }, { language: 'oracle-sql' },
  { pattern: '**/*.{sql,pks,pkb,pls,SQL,PKS,PKB,PLS}' }
];

function options(editorOpts) {
  const c = vscode.workspace.getConfiguration('oracleSqlTidy');
  const size = c.get('indentSize', 0);
  return {
    keywordCase: c.get('keywordCase', 'upper'),
    commaStyle: c.get('commaStyle', 'trailing'),
    maxLineWidth: Math.max(0, c.get('maxLineWidth', 120) | 0),
    indentSize: size > 0 ? size : (editorOpts && editorOpts.tabSize) || 4,
    useTabs: size > 0 ? false : !!(editorOpts && editorOpts.insertSpaces === false)
  };
}

/** Formats text and checks the result keeps every token; returns null (and warns) when it would not. */
function tidy(text, eol, opts) {
  const src = text.replace(/\r\n/g, '\n');
  const out = format(src, opts);
  if (!sameTokens(src, out)) {
    vscode.window.showWarningMessage('Oracle SQL Tidy left the text unchanged: the formatted result would not match the original tokens. Please report this snippet.');
    return null;
  }
  return eol === vscode.EndOfLine.CRLF ? out.replace(/\n/g, '\r\n') : out;
}

function documentEdits(doc, editorOpts) {
  const text = doc.getText();
  const out = tidy(text, doc.eol, options(editorOpts));
  if (out === null || out === text) return [];
  return [vscode.TextEdit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), out)];
}

function rangeEdits(doc, range, editorOpts) {
  // whole lines, so the formatter sees complete tokens; the first line's indentation is kept for every line
  let last = range.end.line;
  if (range.end.character === 0 && last > range.start.line) last--;   // a selection ending at a line start excludes that line
  const r = new vscode.Range(range.start.line, 0, last, doc.lineAt(last).text.length);
  const text = doc.getText(r);
  if (!text.trim()) return [];
  const o = options(editorOpts);
  o.baseIndent = /^[ \t]*/.exec(doc.lineAt(r.start.line).text)[0];
  let out = tidy(text, doc.eol, o);
  if (out === null) return [];
  out = out.replace(/\r?\n$/, '');
  return out === text ? [] : [vscode.TextEdit.replace(r, out)];
}

function activate(context) {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(SELECTOR, {
      provideDocumentFormattingEdits: (doc, opts) => documentEdits(doc, opts)
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider(SELECTOR, {
      provideDocumentRangeFormattingEdits: (doc, range, opts) => rangeEdits(doc, range, opts)
    }),
    vscode.commands.registerCommand('oracleSqlTidy.format', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return;
      const opts = { tabSize: ed.options.tabSize, insertSpaces: ed.options.insertSpaces };
      const edits = ed.selection.isEmpty ? documentEdits(ed.document, opts) : rangeEdits(ed.document, ed.selection, opts);
      if (!edits.length) { vscode.window.setStatusBarMessage('Oracle SQL Tidy: already formatted', 2500); return; }
      await ed.edit(b => edits.forEach(e => b.replace(e.range, e.newText)));
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };

'use strict';
const vscode = require('vscode');
const { lint, RULES } = require('./core');

const LINKS = {
  pro: 'https://plugins.jetbrains.com/plugin/35825-pl-sql-lint',
  ora: 'https://catalonec1.github.io/Gr-dina-de-stele/ora/',
  book: 'https://www.amazon.com/s?k=%22PL%2FSQL+in+Practice%22&i=digital-text',
  rules: 'https://github.com/catalonec1/plsql-lint#rules'
};
const LANGS = new Set(['plsql', 'oraclesql', 'sql', 'oracle-sql']);
const SEV = { error: vscode.DiagnosticSeverity.Error, warning: vscode.DiagnosticSeverity.Warning, info: vscode.DiagnosticSeverity.Information };

function activate(context) {
  const diags = vscode.languages.createDiagnosticCollection('plsql-lint');
  context.subscriptions.push(diags);
  const timers = new Map();

  const run = doc => {
    const cfg = vscode.workspace.getConfiguration('plsqlLint', doc.uri);
    if (!cfg.get('enable', true) || !LANGS.has(doc.languageId)) { diags.delete(doc.uri); return; }
    const select = Object.keys(RULES).filter(c => c !== 'PLL009' || cfg.get('checkLineLength', false));
    const findings = lint(doc.getText(), { select, ignore: cfg.get('ignore', []).map(s => String(s).toUpperCase()), maxLineLength: cfg.get('maxLineLength', 120) });
    diags.set(doc.uri, findings.map(f => {
      const line = Math.max(0, f.line - 1);
      const col = Math.max(0, f.col - 1);
      const text = line < doc.lineCount ? doc.lineAt(line).text : '';
      const m = /^[\w$#*'|=<>!^~]+/.exec(text.slice(col));
      const end = col + (m ? m[0].length : 1);
      const d = new vscode.Diagnostic(new vscode.Range(line, col, line, Math.max(end, col + 1)), f.message, SEV[f.severity]);
      d.source = 'plsql-lint';
      d.code = { value: f.code, target: vscode.Uri.parse(LINKS.rules) };
      return d;
    }));
  };
  const schedule = doc => {
    clearTimeout(timers.get(doc.uri.toString()));
    timers.set(doc.uri.toString(), setTimeout(() => run(doc), 300));
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(run),
    vscode.workspace.onDidChangeTextDocument(e => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument(d => diags.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('plsqlLint')) vscode.workspace.textDocuments.forEach(run); }),
    vscode.languages.registerCodeActionsProvider([...LANGS].map(language => ({ language })), {
      provideCodeActions(doc, _range, ctx) {
        return ctx.diagnostics.filter(d => d.source === 'plsql-lint').map(d => {
          const code = typeof d.code === 'object' ? d.code.value : d.code;
          const a = new vscode.CodeAction(`Ignore ${code} on this line`, vscode.CodeActionKind.QuickFix);
          const line = doc.lineAt(d.range.start.line);
          a.edit = new vscode.WorkspaceEdit();
          a.edit.insert(doc.uri, line.range.end, ` -- noqa: ${code}`);
          a.diagnostics = [d];
          return a;
        });
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.commands.registerCommand('plsqlLint.lintFile', () => {
      const ed = vscode.window.activeTextEditor;
      if (ed) { run(ed.document); vscode.commands.executeCommand('workbench.actions.view.problems'); }
    }),
    vscode.commands.registerCommand('plsqlLint.openPro', () => vscode.env.openExternal(vscode.Uri.parse(LINKS.pro))),
    vscode.commands.registerCommand('plsqlLint.openOraReference', () => vscode.env.openExternal(vscode.Uri.parse(LINKS.ora))),
    vscode.commands.registerCommand('plsqlLint.openBook', () => vscode.env.openExternal(vscode.Uri.parse(LINKS.book)))
  );
  vscode.workspace.textDocuments.forEach(run);
}

function deactivate() {}
module.exports = { activate, deactivate };

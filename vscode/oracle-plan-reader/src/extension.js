'use strict';
const vscode = require('vscode');
const { parse, analyze, selfPercent, effectiveRows, human, looksLikePlan, worstByLine } = require('./core');
const { explain } = require('./operations');
const report = require('./report');

const LINKS = {
  pro: 'https://plugins.jetbrains.com/plugin/35913-oracle-plan-reader',
  lint: 'https://marketplace.visualstudio.com/items?itemName=catalonec.plsql-lint'
};

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('oraclePlanReader');
  const opts = () => ({ bigRows: cfg().get('bigRows', 10000), hotPercent: cfg().get('hotPercent', 50) });
  const diags = vscode.languages.createDiagnosticCollection('oracle-plan-reader');
  const deco = {
    error: vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'), overviewRulerColor: new vscode.ThemeColor('editorError.foreground'), overviewRulerLane: 4 }),
    warning: vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'), overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'), overviewRulerLane: 4 }),
    cost: vscode.window.createTextEditorDecorationType({ after: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 1.5em' } })
  };
  const cache = new Map(); // uri -> {version, plan, findings}
  const planOf = doc => {
    const key = doc.uri.toString(), c = cache.get(key);
    if (c && c.version === doc.version) return c;
    const text = doc.getText();
    const plan = doc.lineCount <= 20000 && looksLikePlan(text) ? parse(text) : null;
    const v = { version: doc.version, plan, findings: plan ? analyze(plan, opts()) : [] };
    cache.set(key, v);
    return v;
  };
  const enabledFor = doc => cfg().get('autoDetect', true) || doc.languageId === 'oracle-xplan';

  const refresh = ed => {
    if (!ed) return;
    const doc = ed.document;
    const { plan, findings } = enabledFor(doc) ? planOf(doc) : { plan: null, findings: [] };
    if (!plan || !plan.lines.length) {
      Object.values(deco).forEach(d => ed.setDecorations(d, []));
      diags.delete(doc.uri); return;
    }
    const rng = l => new vscode.Range(l.srcLine, Math.max(0, l.opStart), l.srcLine, Math.max(l.opStart + 1, l.opEnd));
    const worst = worstByLine(findings);
    const by = { error: [], warning: [] };
    for (const l of plan.lines) {
      const s = worst.get(l.id);
      if (s === 'error' || s === 'warning') by[s].push({ range: rng(l) });
    }
    ed.setDecorations(deco.error, by.error);
    ed.setDecorations(deco.warning, by.warning);
    const min = cfg().get('inlineCostPercent', 10);
    ed.setDecorations(deco.cost, min < 0 ? [] : plan.lines.map(l => ({ l, p: selfPercent(plan, l) })).filter(x => x.p >= min && x.p > 0)
      .map(({ l, p }) => ({ range: new vscode.Range(l.srcLine, 0, l.srcLine, doc.lineAt(l.srcLine).text.length), renderOptions: { after: { contentText: `◀ ${p}% of cost` } } })));
    if (!cfg().get('diagnostics', true)) { diags.delete(doc.uri); return; }
    diags.set(doc.uri, findings.filter(f => f.lineId >= 0).map(f => {
      const d = new vscode.Diagnostic(rng(plan.line(f.lineId)), `${f.title}. ${f.advice}`,
        f.severity === 'error' ? vscode.DiagnosticSeverity.Error : f.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
      d.source = 'plan-reader'; d.code = f.rule;
      return d;
    }));
  };
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(() => refresh(vscode.window.activeTextEditor), 300); };

  let panel = null;
  const showReport = (text, uri) => {
    const plan = parse(text);
    const findings = analyze(plan, opts());
    if (!panel) {
      panel = vscode.window.createWebviewPanel('oraclePlanReader', 'Plan Reader', vscode.ViewColumn.Beside, { enableScripts: false, enableCommandUris: true });
      if (panel.onDidDispose) panel.onDidDispose(() => { panel = null; });
    } else if (panel.reveal) panel.reveal(undefined, true);
    const link = uri ? line => `command:oraclePlanReader.reveal?${encodeURIComponent(JSON.stringify([uri.toString(), line]))}` : () => null;
    panel.title = plan.planHash ? `Plan ${plan.planHash}` : 'Plan Reader';
    panel.webview.html = report.html(plan, findings, link);
    return { plan, findings };
  };

  context.subscriptions.push(diags, ...Object.values(deco),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeTextDocument(e => { const ed = vscode.window.activeTextEditor; if (ed && e.document === ed.document) later(); }),
    vscode.workspace.onDidCloseTextDocument(d => { cache.delete(d.uri.toString()); diags.delete(d.uri); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('oraclePlanReader')) { cache.clear(); refresh(vscode.window.activeTextEditor); } }),
    vscode.languages.registerHoverProvider([{ scheme: 'file' }, { scheme: 'untitled' }], {
      provideHover(doc, pos) {
        if (!enabledFor(doc)) return;
        const { plan } = planOf(doc);
        if (!plan) return;
        const l = plan.lines.find(x => x.srcLine === pos.line);
        if (!l) return;
        const ex = explain(l.operation);
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${l.id} ${l.operation}**${l.name ? ` on \`${l.name}\`` : ''}\n\n`);
        md.appendMarkdown(ex ? `${ex.text}\n\n` : 'No explanation for this operation yet.\n\n');
        const rows = effectiveRows(l), pct = selfPercent(plan, l), stats = [];
        if (rows >= 0) stats.push(`${plan.hasActuals ? 'actual' : 'estimated'} rows ${human(rows)}`);
        if (l.cost >= 0) stats.push(`cost ${l.cost}`);
        if (pct >= 0) stats.push(`this step alone ${pct}% of the total`);
        if (l.starts > 0) stats.push(`started ${human(l.starts)} times`);
        if (stats.length) md.appendMarkdown(stats.join(' · ') + '\n\n');
        for (const p of plan.predicatesOf(l.id)) md.appendCodeblock(p, 'sql');
        return new vscode.Hover(md, new vscode.Range(l.srcLine, Math.max(0, l.opStart), l.srcLine, Math.max(l.opStart + 1, l.opEnd)));
      }
    }),
    vscode.commands.registerCommand('oraclePlanReader.analyze', () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return vscode.commands.executeCommand('oraclePlanReader.analyzeClipboard');
      const sel = ed.document.getText(ed.selection);
      const r = showReport(sel && looksLikePlan(sel) ? sel : ed.document.getText(), sel && looksLikePlan(sel) ? null : ed.document.uri);
      refresh(ed);
      return r;
    }),
    vscode.commands.registerCommand('oraclePlanReader.analyzeClipboard', async () => {
      const text = await vscode.env.clipboard.readText();
      if (!looksLikePlan(text || '')) return vscode.window.showWarningMessage('The clipboard does not contain a DBMS_XPLAN plan table (a line like "| Id | Operation | Name |").');
      const doc = await vscode.workspace.openTextDocument({ content: text, language: 'oracle-xplan' });
      const ed = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      refresh(ed);
      return showReport(text, doc.uri);
    }),
    vscode.commands.registerCommand('oraclePlanReader.reveal', async (uri, line) => {
      const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri) || await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
      const ed = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const r = new vscode.Range(line, 0, line, 0);
      ed.selection = new vscode.Selection(r.start, r.end); ed.revealRange(r);
    }),
    vscode.commands.registerCommand('oraclePlanReader.openPro', () => vscode.env.openExternal(vscode.Uri.parse(LINKS.pro))),
    vscode.commands.registerCommand('oraclePlanReader.openLint', () => vscode.env.openExternal(vscode.Uri.parse(LINKS.lint)))
  );
  refresh(vscode.window.activeTextEditor);
}

function deactivate() {}
module.exports = { activate, deactivate };

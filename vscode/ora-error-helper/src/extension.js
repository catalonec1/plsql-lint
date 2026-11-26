'use strict';
const vscode = require('vscode');
const { load, scan, markdown, BASE } = require('./catalog');

const LINKS = {
  pro: 'https://plugins.jetbrains.com/plugin/35912-ora-error-helper',
  lint: 'https://marketplace.visualstudio.com/items?itemName=catalonec.plsql-lint',
  book: 'https://www.amazon.com/s?k=%22PL%2FSQL+in+Practice%22&i=digital-text'
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function activate(context) {
  const cat = load();
  const open = url => vscode.env.openExternal(vscode.Uri.parse(url));

  const show = e => {
    const p = vscode.window.createWebviewPanel('oraError', e.code, vscode.ViewColumn.Beside, { enableScripts: false });
    p.webview.html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px 20px;line-height:1.5;max-width:760px}h1{font-size:1.3em}h2{font-size:1.05em;margin-top:1.2em}a{color:var(--vscode-textLink-foreground)}.m{opacity:.75;font-size:.9em}</style>
<h1>${esc(e.code)}: ${esc(e.title)}</h1><h2>Cause</h2><p>${esc(e.cause)}</p><h2>How to fix</h2><p>${esc(e.action)}</p>
<p><a href="${esc(e.url)}">Full page in the ORA error reference</a></p>
<p class="m">Using IntelliJ IDEA or DataGrip? <a href="${LINKS.pro}">ORA Error Helper for JetBrains</a> · Book: <a href="${LINKS.book}">PL/SQL in Practice</a></p>`;
  };

  const pick = async initial => {
    const items = [...cat.values()].map(e => ({ label: e.code, description: e.title, e }));
    const qp = vscode.window.createQuickPick();
    qp.items = items; qp.matchOnDescription = true; qp.placeholder = 'Type an error code or words, e.g. ORA-01403 or "no data"';
    qp.value = initial || '';
    qp.onDidAccept(() => { const s = qp.selectedItems[0]; qp.hide(); if (s) show(s.e); });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  };

  const cfg = () => vscode.workspace.getConfiguration('oraErrors');
  const SELECTOR = [{ scheme: 'file' }, { scheme: 'untitled' }, { scheme: 'output' }, { scheme: 'vscode-notebook-cell' }];

  // Status bar: shows the error codes found in the active editor; click to list them.
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  bar.command = 'oraErrors.scanFile';
  const updateBar = () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || !cfg().get('statusBar', true) || ed.document.lineCount > 20000) return bar.hide();
    const n = scan(ed.document.getText()).length;
    if (!n) return bar.hide();
    bar.text = `$(error) ${n} ORA`; bar.tooltip = `${n} Oracle error code(s) in this file. Click to list them.`; bar.show();
  };
  let barT;
  const later = () => { clearTimeout(barT); barT = setTimeout(updateBar, 400); };

  context.subscriptions.push(
    bar,
    vscode.window.onDidChangeActiveTextEditor(updateBar),
    vscode.workspace.onDidChangeTextDocument(e => { if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) later(); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('oraErrors')) updateBar(); }),
    // Ctrl+click on a code in a file opens its explanation.
    vscode.languages.registerDocumentLinkProvider(SELECTOR, {
      provideDocumentLinks(doc) {
        if (!cfg().get('links', true) || doc.lineCount > 20000) return [];
        const links = [];
        for (let i = 0; i < doc.lineCount; i++)
          for (const h of scan(doc.lineAt(i).text)) {
            if (!cat.has(h.code)) continue;
            const l = new vscode.DocumentLink(new vscode.Range(i, h.index, i, h.index + h.length),
              vscode.Uri.parse(`command:oraErrors.show?${encodeURIComponent(JSON.stringify([h.code]))}`));
            l.tooltip = `${h.code}: ${cat.get(h.code).title}`; links.push(l);
          }
        return links;
      }
    }),
    // Codes printed in the integrated terminal (SQL*Plus, SQLcl, sqlldr, app logs) become clickable.
    vscode.window.registerTerminalLinkProvider({
      provideTerminalLinks(ctx) {
        if (!cfg().get('terminalLinks', true)) return [];
        return scan(ctx.line).filter(h => cat.has(h.code)).map(h => ({ startIndex: h.index, length: h.length, tooltip: `Explain ${h.code}: ${cat.get(h.code).title}`, code: h.code }));
      },
      handleTerminalLink(link) { show(cat.get(link.code)); }
    }),
    vscode.commands.registerCommand('oraErrors.show', code => { const e = cat.get(code); if (e) show(e); else pick(code || ''); }),
    vscode.languages.registerHoverProvider(SELECTOR, {
      provideHover(doc, pos) {
        if (!cfg().get('hover', true)) return;
        const line = doc.lineAt(pos.line).text;
        for (const h of scan(line)) {
          if (pos.character < h.index || pos.character > h.index + h.length) continue;
          const e = cat.get(h.code);
          const md = new vscode.MarkdownString(e ? markdown(e) : `**${h.code}** is not in the offline catalog yet. [Search the ORA error reference](${BASE}#search)`);
          return new vscode.Hover(md, new vscode.Range(pos.line, h.index, pos.line, h.index + h.length));
        }
      }
    }),
    vscode.commands.registerCommand('oraErrors.explain', async () => {
      const ed = vscode.window.activeTextEditor;
      let seed = ed ? ed.document.getText(ed.selection) : '';
      if (!scan(seed).length) seed = await vscode.env.clipboard.readText();
      const hits = scan(seed || '');
      if (hits.length && cat.has(hits[0].code)) return show(cat.get(hits[0].code));
      return pick(hits.length ? hits[0].code : '');
    }),
    vscode.commands.registerCommand('oraErrors.browse', () => pick('')),
    vscode.commands.registerCommand('oraErrors.scanFile', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return;
      const doc = ed.document, items = [];
      for (let i = 0; i < doc.lineCount; i++)
        for (const h of scan(doc.lineAt(i).text)) {
          const e = cat.get(h.code);
          items.push({ label: h.code, description: e ? e.title : 'not in catalog', detail: `line ${i + 1}`, line: i, h, e });
        }
      if (!items.length) return vscode.window.showInformationMessage('No ORA-/PLS-/TNS- error codes in this file.');
      const s = await vscode.window.showQuickPick(items, { placeHolder: `${items.length} error code(s) found` });
      if (!s) return;
      const r = new vscode.Range(s.line, s.h.index, s.line, s.h.index + s.h.length);
      ed.selection = new vscode.Selection(r.start, r.end); ed.revealRange(r);
      if (s.e) show(s.e);
    }),
    vscode.commands.registerCommand('oraErrors.openReference', () => open(BASE)),
    vscode.commands.registerCommand('oraErrors.openLint', () => open(LINKS.lint)),
    vscode.commands.registerCommand('oraErrors.openPro', () => open(LINKS.pro))
  );
  updateBar();
}

function deactivate() {}
module.exports = { activate, deactivate };

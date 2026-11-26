'use strict';
// HTML summary for the webview. No scripts: rows link to the editor through command: URIs.
const { analyze, effectiveRows, human, selfCost, selfPercent, worstByLine } = require('./core');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param plan parsed plan
 * @param findings analyze() result
 * @param {(line:number)=>string|null} [linkFor] command URI that reveals a source line, or null
 */
function html(plan, findings, linkFor = () => null) {
  const head = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:10px 18px;line-height:1.45}
h2{font-size:1.05em;margin:1.2em 0 .4em}table{border-collapse:collapse;font-size:.92em}td,th{padding:2px 8px;vertical-align:top;text-align:left}
th{border-bottom:1px solid var(--vscode-panel-border,#8884)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.op{font-family:var(--vscode-editor-font-family);white-space:pre}.pred{opacity:.75;font-family:var(--vscode-editor-font-family);font-size:.9em}
.error{color:var(--vscode-errorForeground,#e05555);font-weight:600}.warning{color:var(--vscode-editorWarning-foreground,#d9a343);font-weight:600}.info{color:var(--vscode-editorInfo-foreground,#5394ec)}
.bar{display:inline-block;height:.7em;background:var(--vscode-charts-orange,#d9a343);vertical-align:middle;margin-right:4px}a{color:var(--vscode-textLink-foreground)}.m{opacity:.75;font-size:.9em}</style>`;
  if (!plan.lines.length) {
    return `${head}<p>No plan table found. Paste the output of <code>SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY)</code> or
<code>DBMS_XPLAN.DISPLAY_CURSOR(format =&gt; 'ALLSTATS LAST')</code>, including the lines that start with <code>|</code>.</p>`;
  }
  const b = [head];
  const root = plan.root;
  b.push(`<p><b>${plan.lines.length} steps</b>${plan.planHash ? `, plan hash ${esc(plan.planHash)}` : ''}${root.cost >= 0 ? `, total cost ${root.cost}` : ''}${plan.hasActuals ? ', with actual row counts' : ', estimates only'}.</p>`);
  b.push('<h2>Findings</h2>');
  if (!findings.length) b.push('<p>Nothing stands out.</p>');
  else {
    b.push('<table>');
    for (const f of findings) {
      const l = plan.line(f.lineId), href = l ? linkFor(l.srcLine) : null;
      const where = f.lineId >= 0 ? (href ? `<a href="${esc(href)}">Id ${f.lineId}</a>` : `Id ${f.lineId}`) : 'Plan';
      b.push(`<tr><td class="${f.severity}">${f.severity.toUpperCase()}</td><td>${where}</td><td><b>${esc(f.title)}</b><br>${esc(f.advice)}</td></tr>`);
    }
    b.push('</table>');
  }
  const worst = worstByLine(findings);
  b.push(`<h2>Plan</h2><table><tr><th>Id</th><th>Operation</th><th>Name</th><th class="n">${plan.hasActuals ? 'A-Rows' : 'Rows'}</th><th class="n">Cost</th><th>Self cost</th></tr>`);
  for (const l of plan.lines) {
    const sev = worst.get(l.id), rows = effectiveRows(l), pct = selfPercent(plan, l), href = linkFor(l.srcLine);
    const id = `${l.hasPredicate ? '*' : ''}${l.id}`;
    b.push(`<tr><td>${href ? `<a href="${esc(href)}">${id}</a>` : id}</td><td class="op${sev ? ' ' + sev : ''}">${' '.repeat(2 * l.depth)}${esc(l.operation)}</td><td>${esc(l.name)}</td>`
      + `<td class="n">${rows >= 0 ? human(rows) : ''}</td><td class="n">${l.cost >= 0 ? l.cost : ''}</td>`
      + `<td>${pct > 0 ? `<span class="bar" style="width:${Math.max(2, pct)}px"></span>${pct}%` : (selfCost(l) === 0 ? '' : '')}</td></tr>`);
    for (const p of plan.predicatesOf(l.id)) b.push(`<tr><td></td><td colspan="5" class="pred">${' '.repeat(2 * l.depth + 2)}${esc(p)}</td></tr>`);
  }
  b.push('</table>');
  if (plan.notes.length) b.push(`<h2>Notes</h2><ul>${plan.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
  b.push('<p class="m">More checks (estimate errors, implicit conversions, nested loops over big row sources, partition pruning, temp spills, dynamic statistics) are in <a href="https://plugins.jetbrains.com/plugin/35913-oracle-plan-reader">Oracle Plan Reader for JetBrains IDEs</a>.</p>');
  return b.join('\n');
}

module.exports = { html, analyze, esc };

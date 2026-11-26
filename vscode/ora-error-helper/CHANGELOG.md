# Changelog

## 1.2.0

- Copy an explanation as Markdown: new command, editor context menu entry, and a link in the hover and in the panel.
- The explanation panel is reused instead of opening a new tab each time, and lists recently viewed errors; `Browse all Oracle errors` shows them first; new commands `Recently viewed errors` and `Clear recently viewed errors`.
- CodeLens with the error title above lines that contain an error code, in log and trace files by default (setting `oraErrors.codeLens`: `logs`, `all`, `off`).

## 1.1.0

- Ctrl+click an error code in any file to open its explanation.
- Error codes printed in the integrated terminal (SQL*Plus, SQLcl, sqlldr, application logs) are clickable.
- Status bar counter of error codes in the active file; click it to jump to them.
- Settings to turn hover, links, terminal links and the status bar on or off.

## 1.0.0

- First release: hover for ORA-/PLS-/TNS- codes, 251 errors offline, browse and scan commands.

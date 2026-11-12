# ORA Error Helper for VS Code

Hover any `ORA-`, `PLS-` or `TNS-` error code to see what it means and how to fix it. Works in SQL files, logs, stack traces, Java/Python/C# code and plain text. 251 common Oracle errors are bundled, so it works offline.

## Features

- **Hover**: point at `ORA-00942`, `ora 1403` or `PLS-00201` anywhere and get the cause and the fix.
- **Explain error** (`ORA Error Helper: Explain error`): uses the selection, or the clipboard if nothing is selected. Also in the editor right-click menu.
- **Browse all Oracle errors**: searchable list by code or words ("no data", "deadlock", "mutating").
- **Find error codes in this file**: lists every code in a log file and jumps to it.
- Each explanation links to its page in the online [ORA error reference](https://catalonec1.github.io/Gr-dina-de-stele/ora/).

## More tools

- [PL/SQL Lint for VS Code](https://marketplace.visualstudio.com/items?itemName=catalonec.plsql-lint): catches PL/SQL bugs while you type (free).
- JetBrains IDEs: [ORA Error Helper](https://plugins.jetbrains.com/plugin/35912-ora-error-helper), [PL/SQL Lint](https://plugins.jetbrains.com/plugin/35825-pl-sql-lint), [Oracle Plan Reader](https://plugins.jetbrains.com/plugin/35913-oracle-plan-reader).
- Book: [PL/SQL in Practice](https://www.amazon.com/s?k=%22PL%2FSQL+in+Practice%22&i=digital-text) (Kindle).

The explanations are written for this extension and are not Oracle documentation. Oracle is a registered trademark of Oracle Corporation; this extension is not affiliated with Oracle.

MIT license.

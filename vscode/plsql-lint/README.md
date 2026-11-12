# PL/SQL Lint for VS Code

Catches the Oracle SQL and PL/SQL mistakes that compile fine but break in production. Problems are shown while you type, in the editor and in the Problems panel. Works offline, no Oracle connection or Python needed.

## Rules

| Code | What it catches |
|---|---|
| PLL001 | `WHEN OTHERS` handler that does not re-raise (and `WHEN OTHERS THEN NULL`) |
| PLL002 | `SELECT *` (allowed inside `EXISTS`) |
| PLL003 | `COMMIT` / `ROLLBACK` inside a loop |
| PLL004 | `= NULL` / `<> NULL`, which are never true |
| PLL005 | Dynamic SQL built with `\|\|` in `EXECUTE IMMEDIATE` / `OPEN FOR` (SQL injection) |
| PLL006 | `DBMS_OUTPUT` left in code |
| PLL007 | `GOTO` |
| PLL008 | `ROWNUM` filter together with `ORDER BY` in the same query |
| PLL009 | Line too long (off by default) |
| PLL010 | `RAISE_APPLICATION_ERROR` number outside -20000..-20999 |
| PLL011 | `END;` without the unit name in `CREATE PROCEDURE/FUNCTION/PACKAGE/TRIGGER` |
| PLL012 | Comparison with `''` (the empty string is NULL in Oracle) |
| PLL013 | `VARCHAR` instead of `VARCHAR2` |
| PLL014 | `NOT IN (SELECT ...)`, which returns nothing when the subquery has a NULL |
| PLL015 | `TO_DATE` / `TO_TIMESTAMP` without a format mask |

## Files

Runs on `sql` files and on `.pks .pkb .pls .plb .pck .prc .fnc .trg .tps .tpb` (registered as PL/SQL), and on documents from Oracle SQL Developer for VS Code (`oraclesql`, `plsql`).

## Turning rules off

- One line: add `-- noqa: PLL002` (or use the quick fix "Ignore PLL002 on this line").
- Whole file: `-- plsql-lint: disable-file=PLL006`.
- Everywhere: setting `plsqlLint.ignore`, e.g. `["PLL006"]`.

## Settings

| Setting | Default | |
|---|---|---|
| `plsqlLint.enable` | `true` | Lint SQL and PL/SQL files |
| `plsqlLint.ignore` | `[]` | Rule codes to turn off |
| `plsqlLint.checkLineLength` | `false` | Enable PLL009 |
| `plsqlLint.maxLineLength` | `120` | Limit for PLL009 |

## More tools

- **Command line and CI**: the same rules as a Python CLI and GitHub Action: [catalonec1/plsql-lint](https://github.com/catalonec1/plsql-lint).
- **JetBrains IDEs (IntelliJ, DataGrip)**: [PL/SQL Lint](https://plugins.jetbrains.com/plugin/35825-pl-sql-lint) adds 5 Pro rules (PLL016-PLL020).
- **ORA error codes**: [ORA Error Helper](https://marketplace.visualstudio.com/items?itemName=catalonec.ora-error-helper) explains `ORA-xxxxx` on hover; online [ORA error reference](https://catalonec1.github.io/Gr-dina-de-stele/ora/).
- **Book**: [PL/SQL in Practice](https://www.amazon.com/s?k=%22PL%2FSQL+in+Practice%22&i=digital-text) (Kindle).

MIT license.

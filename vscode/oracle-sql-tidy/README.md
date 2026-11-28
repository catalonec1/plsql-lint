# Oracle SQL Tidy for VS Code

A formatter for Oracle SQL and PL/SQL that is safe to run on real scripts. It changes only whitespace and the case of keywords: every comment, string literal, `q'[...]'` quote, quoted identifier, bind and substitution variable, SQL*Plus command and `/` terminator stays exactly as you wrote it, in the same order. Before replacing anything the extension re-checks that the formatted text has the same tokens as the original, and leaves the file alone if it does not.

Works offline, no Oracle connection needed.

## Features

- **Format Document** (`Shift+Alt+F`) and **Format Selection** for `sql` and `plsql` documents and `.sql .pks .pkb .pls` files. It also works with Format on Save.
- Command **Oracle SQL Tidy: Format Document/Selection**: formats the selection if there is one, otherwise the whole file. Also in the editor context menu.
- **SQL layout**: one clause per line (`SELECT`, `FROM`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `CONNECT BY`, `FETCH FIRST`, `RETURNING`), joins and `AND` / `OR` conditions on their own lines, subqueries and `WITH` clauses indented, `INSERT`, `UPDATE`, `DELETE` and `MERGE` laid out clause by clause. `BETWEEN x AND y` stays on one line.
- **PL/SQL layout**: `DECLARE` / `BEGIN` / `EXCEPTION` / `END` blocks, `IF` / `ELSIF` / `ELSE`, `CASE` statements, `FOR` / `WHILE` / basic loops, `<<labels>>`, exception handlers, package bodies, procedures, functions and triggers, with parameter lists split one per line.
- **Keyword case**: `UPPER`, `lower` or preserve. Built-in functions (`NVL`, `TO_CHAR`, `COUNT`, ...) follow the same setting. Identifiers, `table.column` names and quoted `"Names"` are never changed.
- **Commas**: trailing (`a,` then `b`) or leading (`a` then `, b`).
- **Soft line width**: long lines are wrapped between tokens, never inside a string or comment.
- **SQL*Plus / SQLcl scripts**: `SET`, `PROMPT`, `DEFINE`, `SPOOL`, `WHENEVER`, `EXEC`, `@script` lines are copied unchanged, and a `/` on its own line stays on its own line.
- Comments after code stay on the same line; blank lines between statements are kept.
- Formatting twice gives the same result as formatting once.
- Keeps the file's line endings (LF or CRLF). A selection keeps the indentation of its first line.

## Example

```sql
select e.id, e.name, d.name dept from emp e left join dept d on d.id = e.dept_id where e.sal > 1000 and d.name like 'A%' order by 2;
```

becomes

```sql
SELECT e.id,
    e.name,
    d.name dept
FROM emp e
    LEFT JOIN dept d ON d.id = e.dept_id
WHERE e.sal > 1000
    AND d.name LIKE 'A%'
ORDER BY 2;
```

## Settings

| Setting | Default | |
|---|---|---|
| `oracleSqlTidy.keywordCase` | `upper` | `upper`, `lower` or `preserve` |
| `oracleSqlTidy.indentSize` | `0` | Spaces per level; `0` uses the editor's tab size and tabs/spaces setting |
| `oracleSqlTidy.commaStyle` | `trailing` | `trailing` or `leading` |
| `oracleSqlTidy.maxLineWidth` | `120` | Soft limit for wrapping long lines; `0` turns wrapping off |

If you have more than one SQL formatter installed, pick this one with **Format Document With...** > **Configure Default Formatter...**, or in `settings.json`:

```json
"[sql]": { "editor.defaultFormatter": "catalonec.oracle-sql-tidy" },
"[plsql]": { "editor.defaultFormatter": "catalonec.oracle-sql-tidy" }
```

## More tools

- [PL/SQL Lint](https://marketplace.visualstudio.com/items?itemName=catalonec.plsql-lint): catches `WHEN OTHERS THEN NULL`, `= NULL`, `COMMIT` in loops and more while you type.
- [ORA Error Helper](https://marketplace.visualstudio.com/items?itemName=catalonec.ora-error-helper): hover any ORA- error code to see what it means and how to fix it.
- [Oracle Plan Reader](https://marketplace.visualstudio.com/items?itemName=catalonec.oracle-plan-reader): read DBMS_XPLAN output and see what to fix.

Oracle is a registered trademark of Oracle Corporation; this extension is not affiliated with Oracle.

MIT license.

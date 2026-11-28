# Oracle Plan Reader for VS Code

Reads the text output of Oracle `DBMS_XPLAN` and shows where the time goes. Paste a plan from SQL*Plus, SQLcl, SQL Developer, DataGrip or an application log, and the costly steps are highlighted right in the text. Works offline: no database connection, no account.

## Features

- **Highlights in the plan text**: cartesian joins in red, full table scans of many rows and the most expensive step in yellow, with the finding in the Problems panel.
- **Cost share at the end of each row**: `◀ 95% of cost` next to every step whose own cost (its cost minus its children's) is at least 10% of the total.
- **Hover any plan row**: what the operation does (about 100 operations: index scans, join methods, sorts, partition pruning, parallel execution...), its rows, cost, share of the total, and its predicates.
- **Summary panel** (`Oracle Plan Reader: Analyze execution plan`): findings with advice, the plan tree with a cost bar per step, predicates and notes. Click an Id to jump to the row.
- **From the clipboard** (`Oracle Plan Reader: Analyze execution plan from clipboard`): opens the plan in a new editor and analyzes it.
- Plans are found in any file (logs, `.txt`, `.sql`); `.xplan` files open as "Oracle Execution Plan". Log prefixes such as timestamps in front of the table rows are ignored.

## Which plans

`DBMS_XPLAN.DISPLAY`, `DISPLAY_CURSOR` and `DISPLAY_AWR` output in the `TYPICAL`, `ALL` and `ALLSTATS LAST` formats. With `ALLSTATS LAST` the actual row counts (`A-Rows`) are used instead of the estimates.

```sql
EXPLAIN PLAN FOR SELECT ...;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);

-- or, after running the query with /*+ GATHER_PLAN_STATISTICS */
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(format => 'ALLSTATS LAST'));
```

## Checks

| Code | What it reports |
|---|---|
| PR01 | The most expensive step (by its own cost) and its share of the total |
| PR02 | Full table scan returning many rows (setting `oraclePlanReader.bigRows`, default 10,000) |
| PR03 | Cartesian join (`MERGE JOIN CARTESIAN`) |

The thresholds are rules of thumb: a finding is a place to look, not a verdict.

## Settings

| Setting | Default | |
|---|---|---|
| `oraclePlanReader.autoDetect` | `true` | Highlight plans in any file; off = only `.xplan` files |
| `oraclePlanReader.diagnostics` | `true` | Findings in the Problems panel |
| `oraclePlanReader.inlineCostPercent` | `10` | Minimum share for the inline "% of cost" (-1 = off) |
| `oraclePlanReader.bigRows` | `10000` | Row count for PR02 |
| `oraclePlanReader.hotPercent` | `50` | Share at which PR01 becomes a warning |

## More tools

- [Oracle Plan Reader for JetBrains IDEs](https://plugins.jetbrains.com/plugin/35913-oracle-plan-reader): 12 more checks (estimate errors, implicit conversions, nested loops over big row sources, partition pruning, temp spills, dynamic statistics...).
- [PL/SQL Lint](https://marketplace.visualstudio.com/items?itemName=catalonec.plsql-lint), [ORA Error Helper](https://marketplace.visualstudio.com/items?itemName=catalonec.ora-error-helper) and [Oracle SQL Tidy](https://marketplace.visualstudio.com/items?itemName=catalonec.oracle-sql-tidy) for VS Code (free).

Oracle is a registered trademark of Oracle Corporation; this extension is not affiliated with Oracle.

MIT license.

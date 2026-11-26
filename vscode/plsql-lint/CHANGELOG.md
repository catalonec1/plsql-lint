# Changelog

## 1.1.0

- 4 new rules, on by default:
  - PLL021 case-without-else: a PL/SQL `CASE` statement without `ELSE` raises ORA-06592 when nothing matches.
  - PLL022 sqlcode-in-sql: `SQLCODE` / `SQLERRM` cannot be used directly inside `INSERT`/`UPDATE`/`SELECT`.
  - PLL023 bulk-fetch-notfound: `EXIT WHEN c%NOTFOUND` after `FETCH ... BULK COLLECT ... LIMIT` drops the last batch.
  - PLL024 commit-in-trigger: `COMMIT` / `ROLLBACK` in a trigger without `PRAGMA AUTONOMOUS_TRANSACTION` (ORA-04092).
- Quick fixes that rewrite the code for PLL004, PLL012, PLL013, PLL021 and PLL023 (next to "Ignore on this line").

## 1.0.1

- README: the PLL005 row now shows `||` correctly on the Marketplace.

## 1.0.0

- First release: 15 rules (PLL001-PLL015) ported from plsql-lint, diagnostics while typing, quick fix to ignore a rule on one line.

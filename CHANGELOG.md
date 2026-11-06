# Changelog

## 0.2.0 - 2026-11-05

Four new rules, all on by default:
- PLL012 compare-with-empty-string: `x = ''` is never true in Oracle.
- PLL013 varchar-type: use `VARCHAR2`, not `VARCHAR`.
- PLL014 not-in-subquery: `NOT IN (SELECT ...)` breaks on NULLs; prefer `NOT EXISTS`.
- PLL015 to-date-no-format: `TO_DATE` / `TO_TIMESTAMP` without a format mask.

## 0.1.0 - 2026-11-04

First release: 11 rules (PLL001-PLL011), text/JSON/GitHub output, inline and
file-level suppressions, `pyproject.toml` config, pre-commit hook and GitHub Action.

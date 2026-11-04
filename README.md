# plsql-lint

[![CI](https://github.com/catalonec1/plsql-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/catalonec1/plsql-lint/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/plsql-lint.svg)](https://pypi.org/project/plsql-lint/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A fast, dependency-free linter for **Oracle SQL and PL/SQL**, written in pure Python.
It catches the bugs that slip through code review in every Oracle shop:
`WHEN OTHERS THEN NULL`, `= NULL`, `COMMIT` inside loops, SQL injection through
concatenated dynamic SQL, `ROWNUM` before `ORDER BY`, and more.

- No database connection, no Java, no dependencies. `pip install` and run.
- Understands comments, string literals and `q'[...]'` quoting, so it never flags text inside them.
- Output for humans, JSON for tools, and native GitHub annotations for pull requests.
- Works as a CLI, a pre-commit hook, a GitHub Action, or a Python library.

```text
$ plsql-lint src/
src/load_orders.prc:4:20: PLL002 [warning] avoid SELECT *; list the columns you need
src/load_orders.prc:4:47: PLL004 [error] '= NULL' is never true; use IS NULL
src/load_orders.prc:6:5: PLL003 [warning] COMMIT inside a loop; commit once after the loop or use bulk processing
src/load_orders.prc:8:3: PLL005 [warning] dynamic SQL built with '||'; use bind variables (USING) and DBMS_ASSERT for identifiers
src/load_orders.prc:12:3: PLL001 [error] WHEN OTHERS THEN NULL silently swallows every error; log and re-raise, or handle specific exceptions

Found 5 issue(s).
```

## Install

```bash
pip install plsql-lint        # or: pipx install plsql-lint
```

Python 3.9 or newer.

## Usage

```bash
plsql-lint path/to/file.sql other/dir      # lint files and directories
cat script.sql | plsql-lint -                # read from stdin
plsql-lint --list-rules                      # show all rules
plsql-lint --ignore PLL006,PLL011 src/       # turn rules off
plsql-lint --select PLL001,PLL004 src/       # run only these rules
plsql-lint --extend-select PLL009 src/       # add opt-in rules
plsql-lint --min-severity warning src/       # hide info findings
plsql-lint --format json src/ > report.json  # machine-readable output
```

Directories are searched for `.sql .pls .plb .pks .pkb .pck .prc .fnc .trg .tps .tpb .bdy .spc .vw`.

Exit codes: `0` no findings, `1` findings, `2` usage or I/O error. Use `--exit-zero` to report without failing.

## Rules

| Code | Severity | Name | What it catches |
|------|----------|------|-----------------|
| PLL001 | warning / error | when-others-no-raise | `WHEN OTHERS` handler that does not re-raise. `WHEN OTHERS THEN NULL` is an error. |
| PLL002 | warning | select-star | `SELECT *` (allowed inside `EXISTS (...)`). |
| PLL003 | warning | commit-in-loop | `COMMIT` / `ROLLBACK` inside a loop. |
| PLL004 | error | compare-with-null | `x = NULL`, `x <> NULL`: never true. `UPDATE ... SET x = NULL` is fine. |
| PLL005 | warning | dynamic-sql-concat | `EXECUTE IMMEDIATE` / `OPEN ... FOR` with a `\|\|`-built string (skipped when `DBMS_ASSERT` is used). |
| PLL006 | info | dbms-output | `DBMS_OUTPUT` calls left in code. |
| PLL007 | warning | goto | `GOTO`. |
| PLL008 | warning | rownum-order-by | `WHERE ROWNUM <= n ... ORDER BY` in the same query: rows are cut before they are sorted. |
| PLL009 | info | line-too-long | Lines longer than `--max-line-length` (default 120). Opt-in. |
| PLL010 | error | raise-app-error-range | `RAISE_APPLICATION_ERROR` number outside -20000..-20999. |
| PLL011 | info | end-without-name | `END;` closing a `CREATE PROCEDURE/FUNCTION/PACKAGE/TRIGGER` instead of `END name;`. |

## Suppressing findings

```sql
SELECT * FROM dual; -- plsql-lint: disable=PLL002
SELECT * FROM dual; -- noqa: PLL002
SELECT * FROM dual; -- noqa                 (all rules on this line)
-- plsql-lint: disable-file=PLL006,PLL011   (anywhere in the file)
```

## Configuration

In `pyproject.toml` (or a `.plsql-lint.toml` file without the `[tool...]` header) in the directory you run from:

```toml
[tool.plsql-lint]
ignore = ["PLL006"]
extend-select = ["PLL009"]
max-line-length = 140
min-severity = "warning"
```

Command line options take precedence. Reading the config file needs Python 3.11+.

## pre-commit

```yaml
repos:
  - repo: https://github.com/catalonec1/plsql-lint
    rev: v0.1.0
    hooks:
      - id: plsql-lint
        args: [--min-severity, warning]
```

## GitHub Action

Findings appear as annotations on the pull request diff.

```yaml
- uses: actions/checkout@v4
- uses: catalonec1/plsql-lint@v0.1.0
  with:
    paths: db/
    args: --ignore PLL006
```

## As a library

```python
from plsql_lint import lint_text, Config

for f in lint_text(open("pkg.pkb").read(), "pkg.pkb", Config(ignore={"PLL011"})):
    print(f.line, f.code, f.message)
```

## How it works and limits

plsql-lint tokenizes the source (comments, strings, q-quotes, quoted identifiers)
and tracks `BEGIN/IF/CASE/LOOP ... END` nesting. It does not build a full parse
tree, so it is fast and tolerant of incomplete scripts, but a rule can miss a case
or, rarely, report one that is fine. Suppress it inline and please open an issue
with a minimal example.

## Contributing

```bash
pip install -e '.[test]'
pytest
```

New rules live in `src/plsql_lint/rules.py`; each one needs a test with a positive
and a negative example.

## Support the project

If plsql-lint saves you a production incident, you can support its development
through [GitHub Sponsors](https://github.com/sponsors/catalonec1) or
[Ko-fi](https://ko-fi.com/catalonec1).

## License

[MIT](LICENSE)

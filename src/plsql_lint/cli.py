"""Command line interface: ``plsql-lint [options] PATH...``"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Sequence

from . import __version__
from .linter import Config, lint_text
from .rules import OPT_IN, RULES, Finding, Severity

EXTENSIONS = (".sql", ".pls", ".plb", ".pks", ".pkb", ".pck", ".prc", ".fnc",
              ".trg", ".tps", ".tpb", ".bdy", ".spc", ".vw")
_SEV_ORDER = {Severity.INFO: 0, Severity.WARNING: 1, Severity.ERROR: 2}


def _split(value: str | None) -> set[str]:
    return {c.strip().upper() for c in (value or "").split(",") if c.strip()}


def _load_file_config(start: str) -> dict:
    """Read [tool.plsql-lint] from pyproject.toml or .plsql-lint.toml in *start*."""
    try:
        import tomllib  # Python 3.11+
    except ModuleNotFoundError:  # pragma: no cover
        return {}
    for name, section in ((".plsql-lint.toml", None), ("pyproject.toml", "plsql-lint")):
        path = os.path.join(start, name)
        if not os.path.isfile(path):
            continue
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        if section is None:
            return data
        tool = data.get("tool", {})
        if section in tool:
            return tool[section]
    return {}


def _iter_files(paths: Sequence[str], extensions: Sequence[str]):
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = sorted(d for d in dirs if not d.startswith("."))
                for f in sorted(files):
                    if f.lower().endswith(tuple(extensions)):
                        yield os.path.join(root, f)
        else:
            yield p


def _format_text(findings: list[Finding]) -> str:
    return "\n".join(f"{f.path}:{f.line}:{f.col}: {f.code} [{f.severity.value}] {f.message}"
                     for f in findings)


def _format_github(findings: list[Finding]) -> str:
    level = {Severity.ERROR: "error", Severity.WARNING: "warning", Severity.INFO: "notice"}
    return "\n".join(
        f"::{level[f.severity]} file={f.path},line={f.line},col={f.col},"
        f"title={f.code}::{f.message}" for f in findings)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="plsql-lint",
        description="Fast, dependency-free linter for Oracle SQL and PL/SQL.")
    p.add_argument("paths", nargs="*", help="files or directories ('-' reads stdin)")
    p.add_argument("--select", help="comma-separated rule codes to enable (default: all)")
    p.add_argument("--extend-select", help="rule codes to enable on top of the defaults (e.g. PLL009)")
    p.add_argument("--ignore", help="comma-separated rule codes to disable")
    p.add_argument("--max-line-length", type=int, help="limit for PLL009 (default 120)")
    p.add_argument("--min-severity", choices=[s.value for s in Severity],
                   help="hide findings below this severity")
    p.add_argument("--format", choices=["text", "json", "github"], default="text")
    p.add_argument("--exit-zero", action="store_true", help="always exit with code 0")
    p.add_argument("--list-rules", action="store_true", help="print all rules and exit")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return p


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.list_rules:
        for r in RULES.values():
            flag = " (opt-in)" if r.code in OPT_IN else ""
            print(f"{r.code}  {r.severity.value:<7}  {r.name:<24} {r.summary}{flag}")
        return 0
    if not args.paths:
        build_parser().print_usage(sys.stderr)
        print("plsql-lint: error: no paths given", file=sys.stderr)
        return 2

    file_cfg = _load_file_config(os.getcwd())
    config = Config()
    select = _split(args.select) or _split(",".join(file_cfg.get("select", [])))
    extend = _split(args.extend_select) | _split(",".join(file_cfg.get("extend-select", [])))
    unknown = (select | extend) - set(RULES)
    if unknown:
        print(f"plsql-lint: error: unknown rule(s): {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2
    if select:
        config.select = select
    config.select = config.select | extend
    config.ignore = _split(args.ignore) | _split(",".join(file_cfg.get("ignore", [])))
    config.max_line_length = args.max_line_length or int(file_cfg.get("max-line-length", 120))
    extensions = tuple(file_cfg.get("extensions", EXTENSIONS))
    min_sev = Severity(args.min_severity or file_cfg.get("min-severity", "info"))

    findings: list[Finding] = []
    for path in _iter_files(args.paths, extensions):
        try:
            if path == "-":
                text = sys.stdin.read()
            else:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
        except OSError as exc:
            print(f"plsql-lint: error: {exc}", file=sys.stderr)
            return 2
        findings.extend(lint_text(text, "<stdin>" if path == "-" else path, config))

    findings = [f for f in findings if _SEV_ORDER[f.severity] >= _SEV_ORDER[min_sev]]

    if args.format == "json":
        print(json.dumps([f.as_dict() for f in findings], indent=2))
    elif findings:
        print(_format_github(findings) if args.format == "github" else _format_text(findings))

    if args.format == "text" and findings:
        print(f"\nFound {len(findings)} issue(s).", file=sys.stderr)
    return 0 if args.exit_zero or not findings else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

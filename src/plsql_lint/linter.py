"""Run rules over source text, honouring inline suppressions."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

from .rules import OPT_IN, RULES, Context, Finding
from .tokenizer import Kind, tokenize

_DIRECTIVE = re.compile(r"plsql-lint:\s*(disable-file|disable)(?:\s*=\s*([A-Za-z0-9_,\s]+))?", re.I)
_NOQA = re.compile(r"\bnoqa\b(?::\s*([A-Za-z0-9_,\s]+))?", re.I)

ALL = "*"


@dataclass
class Config:
    select: set[str] = field(default_factory=lambda: set(RULES) - OPT_IN)
    ignore: set[str] = field(default_factory=set)
    max_line_length: int = 120

    def enabled(self) -> list[str]:
        return sorted(c for c in self.select if c in RULES and c not in self.ignore)


def _codes(raw: str | None) -> set[str]:
    if not raw:
        return {ALL}
    return {c.strip().upper() for c in raw.split(",") if c.strip()}


def lint_text(source: str, path: str = "<stdin>", config: Config | None = None) -> list[Finding]:
    config = config or Config()
    all_tokens = tokenize(source)
    tokens = [t for t in all_tokens if t.kind is not Kind.COMMENT]

    line_off: dict[int, set[str]] = {}
    file_off: set[str] = set()
    for t in all_tokens:
        if t.kind is not Kind.COMMENT:
            continue
        for m in _DIRECTIVE.finditer(t.text):
            codes = _codes(m.group(2))
            if m.group(1).lower() == "disable-file":
                file_off |= codes
            else:
                line_off.setdefault(t.line, set()).update(codes)
        for m in _NOQA.finditer(t.text):
            line_off.setdefault(t.line, set()).update(_codes(m.group(1)))

    ctx = Context(tokens=tokens, lines=source.splitlines(), max_line_length=config.max_line_length)
    findings: list[Finding] = []
    for code in config.enabled():
        if ALL in file_off or code in file_off:
            continue
        for f in RULES[code].check(ctx):
            off = line_off.get(f.line, ())
            if ALL in off or code in off:
                continue
            findings.append(Finding(f.code, f.message, f.line, f.col, f.severity, path))
    findings.sort(key=lambda f: (f.line, f.col, f.code))
    return findings


def lint_files(paths: Iterable[str], config: Config | None = None) -> list[Finding]:
    out: list[Finding] = []
    for p in paths:
        with open(p, encoding="utf-8", errors="replace") as fh:
            out.extend(lint_text(fh.read(), p, config))
    return out

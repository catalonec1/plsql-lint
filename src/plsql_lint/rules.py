"""Lint rules. Each rule receives a :class:`Context` and yields findings."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Iterator

from .tokenizer import Kind, Token


class Severity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass(frozen=True)
class Finding:
    code: str
    message: str
    line: int
    col: int
    severity: Severity
    path: str = "<stdin>"

    def as_dict(self) -> dict:
        return {
            "path": self.path,
            "line": self.line,
            "col": self.col,
            "code": self.code,
            "severity": self.severity.value,
            "message": self.message,
        }


@dataclass
class Context:
    tokens: list[Token]           # without comments
    lines: list[str]
    max_line_length: int = 120
    _blocks: list[tuple[str, ...]] | None = field(default=None, repr=False)

    @property
    def blocks(self) -> list[tuple[str, ...]]:
        """For every token, the stack of open PL/SQL blocks *before* it."""
        if self._blocks is None:
            self._blocks = _block_stacks(self.tokens)
        return self._blocks

    def next_word(self, i: int) -> Token | None:
        return self.tokens[i + 1] if i + 1 < len(self.tokens) else None

    def prev(self, i: int) -> Token | None:
        return self.tokens[i - 1] if i > 0 else None


@dataclass(frozen=True)
class Rule:
    code: str
    name: str
    severity: Severity
    summary: str
    check: Callable[[Context], Iterator[Finding]]


RULES: dict[str, Rule] = {}

#: Rules that exist but are only run when selected explicitly.
OPT_IN: set[str] = {"PLL009"}


def rule(code: str, name: str, severity: Severity, summary: str):
    def deco(fn: Callable[[Context], Iterator[tuple[Token, str] | tuple[Token, str, Severity]]]):
        def check(ctx: Context) -> Iterator[Finding]:
            for item in fn(ctx):
                tok, msg = item[0], item[1]
                sev = item[2] if len(item) > 2 else severity
                yield Finding(code, msg, tok.line, tok.col, sev)
        RULES[code] = Rule(code, name, severity, summary, check)
        return fn
    return deco


# --------------------------------------------------------------------------- #
# Block structure
# --------------------------------------------------------------------------- #

_OPENERS = {"BEGIN", "CASE", "IF", "LOOP"}


def _block_stacks(tokens: list[Token]) -> list[tuple[str, ...]]:
    stack: list[str] = []
    out: list[tuple[str, ...]] = []
    for i, tok in enumerate(tokens):
        out.append(tuple(stack))
        if tok.kind is not Kind.WORD:
            continue
        word = tok.norm
        prev = tokens[i - 1] if i else None
        if word in _OPENERS:
            if prev is not None and prev.is_word("END"):
                continue  # END IF / END LOOP / END CASE: closed by the END
            stack.append(word)
        elif word == "END" and stack:
            stack.pop()
    return out


def _handler_end(ctx: Context, start: int, depth: int) -> int:
    """Index just past the exception handler whose body starts at *start*."""
    toks = ctx.tokens
    blocks = ctx.blocks
    for j in range(start, len(toks)):
        if len(blocks[j]) == depth:
            if toks[j].is_word("WHEN") or toks[j].is_word("END"):
                return j
        elif len(blocks[j]) < depth:
            return j
    return len(toks)


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #

@rule("PLL001", "when-others-no-raise", Severity.WARNING,
      "WHEN OTHERS handler that does not re-raise the error.")
def _when_others(ctx: Context):
    toks = ctx.tokens
    for i in range(len(toks) - 2):
        if not (toks[i].is_word("WHEN") and toks[i + 1].is_word("OTHERS") and toks[i + 2].is_word("THEN")):
            continue
        body_start = i + 3
        depth = len(ctx.blocks[i])
        end = _handler_end(ctx, body_start, depth)
        body = toks[body_start:end]
        words = {t.norm for t in body if t.kind is Kind.WORD}
        if "RAISE" in words or "RAISE_APPLICATION_ERROR" in words:
            continue
        significant = [t for t in body if not (t.kind is Kind.SYMBOL and t.text == ";")]
        if len(significant) == 1 and significant[0].is_word("NULL"):
            yield (toks[i], "WHEN OTHERS THEN NULL silently swallows every error; "
                   "log and re-raise, or handle specific exceptions", Severity.ERROR)
        else:
            yield (toks[i], "WHEN OTHERS handler does not re-raise; add RAISE (or "
                   "RAISE_APPLICATION_ERROR) after logging")


@rule("PLL002", "select-star", Severity.WARNING,
      "SELECT * makes code break silently when columns change.")
def _select_star(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if not tok.is_word("SELECT"):
            continue
        j = i + 1
        if j < len(toks) and toks[j].is_word("DISTINCT", "UNIQUE", "ALL"):
            j += 1
        if j < len(toks) and toks[j].kind is Kind.SYMBOL and toks[j].text == "*":
            # SELECT * inside EXISTS (...) is idiomatic and harmless
            if _inside_exists(toks, i):
                continue
            yield (toks[j], "avoid SELECT *; list the columns you need")


def _inside_exists(toks: list[Token], select_idx: int) -> bool:
    k = select_idx - 1
    while k >= 0 and toks[k].kind is Kind.SYMBOL and toks[k].text == "(":
        k -= 1
    return k >= 0 and toks[k].is_word("EXISTS")


@rule("PLL003", "commit-in-loop", Severity.WARNING,
      "COMMIT or ROLLBACK inside a loop (slow, breaks atomicity, ORA-01555 risk).")
def _commit_in_loop(ctx: Context):
    for i, tok in enumerate(ctx.tokens):
        if tok.is_word("COMMIT", "ROLLBACK") and "LOOP" in ctx.blocks[i]:
            prev = ctx.prev(i)
            if prev is not None and prev.is_word("ON", "PRESERVE", "DELETE"):
                continue  # ON COMMIT ... in DDL
            yield (tok, f"{tok.norm} inside a loop; commit once after the loop "
                   "or use bulk processing")


_COMPARE = {"=", "<>", "!=", "^=", "~="}
_CONDITION_START = {"WHERE", "ON", "HAVING", "WHEN", "IF", "ELSIF", "WHILE", "AND",
                    "OR", "NOT", "RETURN", "THEN", "ELSE", "BEGIN", "LOOP", "CHECK"}


@rule("PLL004", "compare-with-null", Severity.ERROR,
      "Comparison with NULL using = or <> is never true; use IS [NOT] NULL.")
def _compare_null(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if tok.kind is not Kind.SYMBOL or tok.text not in _COMPARE:
            continue
        nxt = ctx.next_word(i)
        prv = ctx.prev(i)
        null_side = nxt if (nxt is not None and nxt.is_word("NULL")) else None
        if null_side is None and prv is not None and prv.is_word("NULL"):
            null_side = prv
        if null_side is None:
            continue
        if tok.text == "=" and _in_set_clause(toks, i):
            continue  # UPDATE ... SET col = NULL is an assignment
        op = "IS NULL" if tok.text == "=" else "IS NOT NULL"
        yield (tok, f"'{tok.text} NULL' is never true; use {op}")


def _in_set_clause(toks: list[Token], idx: int) -> bool:
    depth = 0
    for k in range(idx - 1, -1, -1):
        t = toks[k]
        if t.kind is Kind.SYMBOL:
            if t.text == ")":
                depth += 1
            elif t.text == "(":
                if depth == 0:
                    return False
                depth -= 1
            elif t.text == ";" and depth == 0:
                return False
            continue
        if depth:
            continue
        if t.is_word("SET"):
            return True
        if t.kind is Kind.WORD and t.norm in _CONDITION_START:
            return False
    return False


@rule("PLL005", "dynamic-sql-concat", Severity.WARNING,
      "Dynamic SQL built by concatenation (SQL injection risk, no plan reuse).")
def _dynamic_concat(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        start = None
        if tok.is_word("EXECUTE") and i + 1 < len(toks) and toks[i + 1].is_word("IMMEDIATE"):
            start = i + 2
        elif tok.is_word("FOR") and i >= 2 and toks[i - 2].is_word("OPEN"):
            nxt = ctx.next_word(i)
            if nxt is not None and not nxt.is_word("SELECT", "WITH") and not (
                    nxt.kind is Kind.SYMBOL and nxt.text == "("):
                start = i + 1
        if start is None:
            continue
        concat = False
        for j in range(start, len(toks)):
            t = toks[j]
            if t.kind is Kind.SYMBOL and t.text == ";":
                break
            if t.is_word("USING", "INTO", "BULK", "RETURNING", "RETURN"):
                break
            if t.is_word("DBMS_ASSERT"):
                concat = False  # identifiers are validated: trust the author
                break
            if t.kind is Kind.SYMBOL and t.text == "||":
                concat = True
        if concat:
            yield (tok, "dynamic SQL built with '||'; use bind variables (USING) "
                   "and DBMS_ASSERT for identifiers")


@rule("PLL006", "dbms-output", Severity.INFO,
      "DBMS_OUTPUT left in code; use a logging package instead.")
def _dbms_output(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if tok.is_word("DBMS_OUTPUT") and i + 1 < len(toks) and toks[i + 1].text == ".":
            yield (tok, "DBMS_OUTPUT call; remove debug output or use a logger")


@rule("PLL007", "goto", Severity.WARNING,
      "GOTO makes control flow hard to follow.")
def _goto(ctx: Context):
    for tok in ctx.tokens:
        if tok.is_word("GOTO"):
            yield (tok, "avoid GOTO; restructure with loops, EXIT or procedures")


@rule("PLL008", "rownum-order-by", Severity.WARNING,
      "ROWNUM filter combined with ORDER BY in the same query (filter runs first).")
def _rownum_order(ctx: Context):
    toks = ctx.tokens
    frames: list[dict] = [{"where": False, "rownum": None}]
    for i, tok in enumerate(toks):
        frame = frames[-1]
        if tok.kind is Kind.SYMBOL:
            if tok.text == "(":
                frames.append({"where": False, "rownum": None})
            elif tok.text == ")" and len(frames) > 1:
                frames.pop()
            elif tok.text == ";":
                frames = [{"where": False, "rownum": None}]
            continue
        if tok.is_word("SELECT"):
            frame["where"] = False
            frame["rownum"] = None
        elif tok.is_word("WHERE"):
            frame["where"] = True
        elif tok.is_word("ROWNUM") and frame["where"] and frame["rownum"] is None:
            frame["rownum"] = tok
        elif tok.is_word("ORDER") and frame["rownum"] is not None:
            nxt = ctx.next_word(i)
            if nxt is not None and nxt.is_word("BY", "SIBLINGS"):
                yield (frame["rownum"], "ROWNUM is applied before ORDER BY; sort in a subquery "
                       "or use FETCH FIRST n ROWS ONLY")
                frame["rownum"] = None


@rule("PLL009", "line-too-long", Severity.INFO,
      "Line longer than the configured maximum (default 120).")
def _line_length(ctx: Context):
    for no, text in enumerate(ctx.lines, start=1):
        width = len(text.rstrip("\r\n"))
        if width > ctx.max_line_length:
            yield (Token(Kind.SYMBOL, "", no, ctx.max_line_length + 1),
                   f"line is {width} characters long (max {ctx.max_line_length})")


@rule("PLL010", "raise-app-error-range", Severity.ERROR,
      "RAISE_APPLICATION_ERROR number outside -20000..-20999 (raises ORA-21000).")
def _rae_range(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if not tok.is_word("RAISE_APPLICATION_ERROR"):
            continue
        if i + 1 >= len(toks) or toks[i + 1].text != "(":
            continue
        j = i + 2
        sign = 1
        if j < len(toks) and toks[j].kind is Kind.SYMBOL and toks[j].text in "+-":
            sign = -1 if toks[j].text == "-" else 1
            j += 1
        if j < len(toks) and toks[j].kind is Kind.NUMBER:
            try:
                value = sign * int(toks[j].text)
            except ValueError:
                continue
            if not -20999 <= value <= -20000:
                yield (toks[j], f"error number {value} is outside -20000..-20999")


@rule("PLL011", "end-without-name", Severity.INFO,
      "Named END without the unit name (END; instead of END my_proc;).")
def _end_name(ctx: Context):
    """Only the outermost END of CREATE [OR REPLACE] units is checked."""
    toks = ctx.tokens
    i = 0
    while i < len(toks):
        if toks[i].is_word("CREATE"):
            j = i + 1
            while j < len(toks) and toks[j].is_word("OR", "REPLACE", "EDITIONABLE", "NONEDITIONABLE"):
                j += 1
            if j < len(toks) and toks[j].is_word("PROCEDURE", "FUNCTION", "PACKAGE", "TRIGGER"):
                k = j + 1
                if k < len(toks) and toks[k].is_word("BODY"):
                    k += 1
                name_idx = k
                # skip schema.name
                while name_idx + 2 < len(toks) and toks[name_idx + 1].text == ".":
                    name_idx += 2
                end_idx = _unit_end(toks, name_idx)
                if end_idx is not None:
                    after = toks[end_idx + 1] if end_idx + 1 < len(toks) else None
                    if after is not None and after.text == ";":
                        yield (toks[end_idx], f"add the unit name after END "
                               f"(END {toks[name_idx].text};) for readability")
                    i = end_idx
        i += 1


def _unit_end(toks: list[Token], start: int) -> int | None:
    """Index of the END that is followed by ';' and then '/' or EOF/next CREATE."""
    for k in range(start, len(toks)):
        t = toks[k]
        if t.kind is Kind.SYMBOL and t.text == "/" and k > 0 and toks[k - 1].text == ";":
            e = k - 2
            if e >= 0 and toks[e].is_word("END"):
                return e
            if e >= 1 and toks[e - 1].is_word("END"):
                return None  # END name; already
            return None
        if t.is_word("CREATE") and k > start:
            return None
    return None


# --------------------------------------------------------------------------- #
# 0.2.0 rules
# --------------------------------------------------------------------------- #

@rule("PLL012", "compare-with-empty-string", Severity.ERROR,
      "Comparison with '' is never true: Oracle treats the empty string as NULL.")
def _empty_string(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if tok.kind is not Kind.SYMBOL or tok.text not in _COMPARE:
            continue
        for side in (ctx.next_word(i), ctx.prev(i)):
            if side is not None and side.kind is Kind.STRING and side.text in ("''", "N''", "n''"):
                if tok.text == "=" and _in_set_clause(toks, i):
                    break
                op = "IS NULL" if tok.text == "=" else "IS NOT NULL"
                yield (tok, f"'' is NULL in Oracle, so '{tok.text} ''' is never true; use {op}")
                break


@rule("PLL013", "varchar-type", Severity.INFO,
      "VARCHAR declared instead of VARCHAR2 (Oracle reserves VARCHAR for future semantics).")
def _varchar(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if tok.is_word("VARCHAR"):
            nxt = ctx.next_word(i)
            if nxt is not None and nxt.kind is Kind.SYMBOL and nxt.text in ("(", ";", ",", ":="):
                yield (tok, "use VARCHAR2 instead of VARCHAR")


@rule("PLL014", "not-in-subquery", Severity.WARNING,
      "NOT IN (SELECT ...) returns no rows when the subquery yields a NULL; prefer NOT EXISTS.")
def _not_in(ctx: Context):
    toks = ctx.tokens
    for i in range(len(toks) - 3):
        if toks[i].is_word("NOT") and toks[i + 1].is_word("IN") and toks[i + 2].text == "(" \
                and toks[i + 3].is_word("SELECT", "WITH"):
            yield (toks[i], "NOT IN with a subquery matches nothing if the subquery returns a NULL; "
                   "use NOT EXISTS or filter NULLs in the subquery")


@rule("PLL015", "to-date-no-format", Severity.WARNING,
      "TO_DATE / TO_TIMESTAMP without a format mask depends on NLS settings.")
def _to_date(ctx: Context):
    toks = ctx.tokens
    for i, tok in enumerate(toks):
        if not tok.is_word("TO_DATE", "TO_TIMESTAMP", "TO_TIMESTAMP_TZ"):
            continue
        if i + 1 >= len(toks) or toks[i + 1].text != "(":
            continue
        depth, args = 0, 1
        for j in range(i + 1, len(toks)):
            t = toks[j]
            if t.kind is not Kind.SYMBOL:
                continue
            if t.text == "(":
                depth += 1
            elif t.text == ")":
                depth -= 1
                if depth == 0:
                    break
            elif t.text == "," and depth == 1:
                args += 1
            elif t.text == ";":
                break
        if args == 1:
            yield (tok, f"{tok.norm} without a format mask uses NLS_DATE_FORMAT; "
                   f"pass an explicit mask, e.g. {tok.norm}(x, 'YYYY-MM-DD')")

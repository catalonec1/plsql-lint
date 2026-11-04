"""A small, dependency-free tokenizer for Oracle SQL and PL/SQL.

It is not a full parser. It knows enough about the lexical rules of Oracle
(comments, string literals including q-quotes, quoted identifiers, numbers)
that rules can work on a clean token stream and never match text that sits
inside a comment or a string.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Kind(str, Enum):
    WORD = "word"          # keyword or unquoted identifier, upper-cased in .norm
    QUOTED = "quoted"      # "Quoted Identifier"
    STRING = "string"      # 'literal', q'[literal]', N'literal'
    NUMBER = "number"
    SYMBOL = "symbol"      # operators and punctuation
    COMMENT = "comment"    # -- line or /* block */


@dataclass(frozen=True)
class Token:
    kind: Kind
    text: str
    line: int
    col: int

    @property
    def norm(self) -> str:
        """Upper-cased text for words, raw text otherwise."""
        return self.text.upper() if self.kind is Kind.WORD else self.text

    def is_word(self, *words: str) -> bool:
        return self.kind is Kind.WORD and self.text.upper() in words


_Q_CLOSERS = {"[": "]", "{": "}", "(": ")", "<": ">"}
_TWO_CHAR_SYMBOLS = {"||", ":=", "=>", "<>", "!=", "^=", "~=", "<=", ">=", "..", "**", "<<", ">>"}


class TokenizeError(ValueError):
    pass


def tokenize(source: str, keep_comments: bool = True) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    n = len(source)
    line = 1
    line_start = 0

    def add(kind: Kind, start: int, end: int, tline: int, tcol: int) -> None:
        if kind is Kind.COMMENT and not keep_comments:
            return
        tokens.append(Token(kind, source[start:end], tline, tcol))

    while i < n:
        ch = source[i]
        tline, tcol = line, i - line_start + 1

        if ch == "\n":
            line += 1
            i += 1
            line_start = i
            continue
        if ch in " \t\r\f\v":
            i += 1
            continue

        # -- line comment
        if source.startswith("--", i):
            end = source.find("\n", i)
            end = n if end == -1 else end
            add(Kind.COMMENT, i, end, tline, tcol)
            i = end
            continue

        # /* block comment */
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            end = n if end == -1 else end + 2
            add(Kind.COMMENT, i, end, tline, tcol)
            line, line_start = _advance_lines(source, i, end, line, line_start)
            i = end
            continue

        # q'Xtext X'  (alternative quoting), with optional N prefix: nq'...'
        lower2 = source[i:i + 3].lower()
        qstart = None
        if lower2.startswith("q'"):
            qstart = i + 2
        elif lower2 == "nq'":
            qstart = i + 3
        if qstart is not None and qstart < n:
            opener = source[qstart]
            closer = _Q_CLOSERS.get(opener, opener)
            end = source.find(closer + "'", qstart + 1)
            end = n if end == -1 else end + 2
            add(Kind.STRING, i, end, tline, tcol)
            line, line_start = _advance_lines(source, i, end, line, line_start)
            i = end
            continue

        # 'string' with '' escaping, optional N prefix
        if ch == "'" or (ch in "nN" and source.startswith("'", i + 1)):
            j = i + 1 if ch == "'" else i + 2
            while j < n:
                if source[j] == "'":
                    if j + 1 < n and source[j + 1] == "'":
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            add(Kind.STRING, i, j, tline, tcol)
            line, line_start = _advance_lines(source, i, j, line, line_start)
            i = j
            continue

        # "Quoted identifier"
        if ch == '"':
            end = source.find('"', i + 1)
            end = n if end == -1 else end + 1
            add(Kind.QUOTED, i, end, tline, tcol)
            i = end
            continue

        # identifiers / keywords (Oracle allows $ and # after the first char)
        if ch.isalpha() or ch == "_":
            j = i + 1
            while j < n and (source[j].isalnum() or source[j] in "_$#"):
                j += 1
            add(Kind.WORD, i, j, tline, tcol)
            i = j
            continue

        # numbers: 12, 1.5, .5, 1e10, 10d/10f suffix
        if ch.isdigit() or (ch == "." and i + 1 < n and source[i + 1].isdigit()):
            j = i
            while j < n and source[j].isdigit():
                j += 1
            if j < n and source[j] == "." and not source.startswith("..", j):
                j += 1
                while j < n and source[j].isdigit():
                    j += 1
            if j < n and source[j] in "eE" and j + 1 < n and (source[j + 1].isdigit() or source[j + 1] in "+-"):
                j += 2
                while j < n and source[j].isdigit():
                    j += 1
            if j < n and source[j] in "dDfF" and not (j + 1 < n and (source[j + 1].isalnum() or source[j + 1] == "_")):
                j += 1
            add(Kind.NUMBER, i, j, tline, tcol)
            i = j
            continue

        two = source[i:i + 2]
        if two in _TWO_CHAR_SYMBOLS:
            add(Kind.SYMBOL, i, i + 2, tline, tcol)
            i += 2
            continue

        add(Kind.SYMBOL, i, i + 1, tline, tcol)
        i += 1

    return tokens


def _advance_lines(source: str, start: int, end: int, line: int, line_start: int) -> tuple[int, int]:
    chunk = source[start:end]
    count = chunk.count("\n")
    if count:
        line += count
        line_start = start + chunk.rfind("\n") + 1
    return line, line_start

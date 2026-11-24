package io.github.catalonec1.plsqllint.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Dependency-free tokenizer for Oracle SQL and PL/SQL, a faithful port of
 * {@code plsql_lint/tokenizer.py}. Knows comments, string literals (including
 * q-quotes and N prefixes), quoted identifiers and numbers, so rules never match
 * text inside a comment or a string.
 */
public final class Tokenizer {
    private static final Set<String> TWO_CHAR = Set.of(
            "||", ":=", "=>", "<>", "!=", "^=", "~=", "<=", ">=", "..", "**", "<<", ">>");

    private Tokenizer() {}

    public static List<Token> tokenize(String src) {
        List<Token> out = new ArrayList<>();
        int i = 0, n = src.length(), line = 1, lineStart = 0;
        while (i < n) {
            char ch = src.charAt(i);
            int tline = line, tcol = i - lineStart + 1;
            if (ch == '\n') {
                line++;
                i++;
                lineStart = i;
                continue;
            }
            if (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\f' || ch == 0x0B) {
                i++;
                continue;
            }
            int end;
            if (src.startsWith("--", i)) {
                end = src.indexOf('\n', i);
                end = end == -1 ? n : end;
                out.add(new Token(Token.Kind.COMMENT, src.substring(i, end), tline, tcol, i));
                i = end;
                continue;
            }
            if (src.startsWith("/*", i)) {
                end = src.indexOf("*/", i + 2);
                end = end == -1 ? n : end + 2;
                out.add(new Token(Token.Kind.COMMENT, src.substring(i, end), tline, tcol, i));
                int[] ls = advance(src, i, end, line, lineStart);
                line = ls[0];
                lineStart = ls[1];
                i = end;
                continue;
            }
            String low3 = src.substring(i, Math.min(n, i + 3)).toLowerCase(java.util.Locale.ROOT);
            int qstart = -1;
            if (low3.startsWith("q'")) qstart = i + 2;
            else if (low3.equals("nq'")) qstart = i + 3;
            if (qstart != -1 && qstart < n) {
                char opener = src.charAt(qstart);
                char closer = switch (opener) {
                    case '[' -> ']';
                    case '{' -> '}';
                    case '(' -> ')';
                    case '<' -> '>';
                    default -> opener;
                };
                end = src.indexOf(closer + "'", qstart + 1);
                end = end == -1 ? n : end + 2;
                out.add(new Token(Token.Kind.STRING, src.substring(i, end), tline, tcol, i));
                int[] ls = advance(src, i, end, line, lineStart);
                line = ls[0];
                lineStart = ls[1];
                i = end;
                continue;
            }
            if (ch == '\'' || ((ch == 'n' || ch == 'N') && src.startsWith("'", i + 1))) {
                int j = ch == '\'' ? i + 1 : i + 2;
                while (j < n) {
                    if (src.charAt(j) == '\'') {
                        if (j + 1 < n && src.charAt(j + 1) == '\'') {
                            j += 2;
                            continue;
                        }
                        j++;
                        break;
                    }
                    j++;
                }
                out.add(new Token(Token.Kind.STRING, src.substring(i, j), tline, tcol, i));
                int[] ls = advance(src, i, j, line, lineStart);
                line = ls[0];
                lineStart = ls[1];
                i = j;
                continue;
            }
            if (ch == '"') {
                end = src.indexOf('"', i + 1);
                end = end == -1 ? n : end + 1;
                out.add(new Token(Token.Kind.QUOTED, src.substring(i, end), tline, tcol, i));
                i = end;
                continue;
            }
            if (Character.isLetter(ch) || ch == '_') {
                int j = i + 1;
                while (j < n) {
                    char c = src.charAt(j);
                    if (Character.isLetterOrDigit(c) || c == '_' || c == '$' || c == '#') j++;
                    else break;
                }
                out.add(new Token(Token.Kind.WORD, src.substring(i, j), tline, tcol, i));
                i = j;
                continue;
            }
            if (Character.isDigit(ch) || (ch == '.' && i + 1 < n && Character.isDigit(src.charAt(i + 1)))) {
                int j = i;
                while (j < n && Character.isDigit(src.charAt(j))) j++;
                if (j < n && src.charAt(j) == '.' && !src.startsWith("..", j)) {
                    j++;
                    while (j < n && Character.isDigit(src.charAt(j))) j++;
                }
                if (j < n && (src.charAt(j) == 'e' || src.charAt(j) == 'E') && j + 1 < n
                        && (Character.isDigit(src.charAt(j + 1)) || src.charAt(j + 1) == '+' || src.charAt(j + 1) == '-')) {
                    j += 2;
                    while (j < n && Character.isDigit(src.charAt(j))) j++;
                }
                if (j < n && "dDfF".indexOf(src.charAt(j)) >= 0
                        && !(j + 1 < n && (Character.isLetterOrDigit(src.charAt(j + 1)) || src.charAt(j + 1) == '_'))) {
                    j++;
                }
                out.add(new Token(Token.Kind.NUMBER, src.substring(i, j), tline, tcol, i));
                i = j;
                continue;
            }
            if (i + 2 <= n && TWO_CHAR.contains(src.substring(i, i + 2))) {
                out.add(new Token(Token.Kind.SYMBOL, src.substring(i, i + 2), tline, tcol, i));
                i += 2;
                continue;
            }
            out.add(new Token(Token.Kind.SYMBOL, String.valueOf(ch), tline, tcol, i));
            i++;
        }
        return out;
    }

    private static int[] advance(String src, int start, int end, int line, int lineStart) {
        int last = -1;
        for (int k = start; k < end; k++) {
            if (src.charAt(k) == '\n') {
                line++;
                last = k;
            }
        }
        if (last != -1) lineStart = last + 1;
        return new int[]{line, lineStart};
    }
}

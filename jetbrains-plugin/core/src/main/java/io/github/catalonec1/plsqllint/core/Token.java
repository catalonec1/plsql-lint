package io.github.catalonec1.plsqllint.core;

import java.util.Locale;

/** One lexical token of Oracle SQL / PL/SQL source. */
public final class Token {
    public enum Kind { WORD, QUOTED, STRING, NUMBER, SYMBOL, COMMENT }

    public final Kind kind;
    public final String text;
    /** 1-based line and column, as in the Python CLI. */
    public final int line;
    public final int col;
    /** 0-based character offset in the source. */
    public final int offset;
    private final String norm;

    public Token(Kind kind, String text, int line, int col, int offset) {
        this.kind = kind;
        this.text = text;
        this.line = line;
        this.col = col;
        this.offset = offset;
        this.norm = kind == Kind.WORD ? text.toUpperCase(Locale.ROOT) : text;
    }

    /** Upper-cased text for words, raw text otherwise. */
    public String norm() {
        return norm;
    }

    public int end() {
        return offset + text.length();
    }

    public boolean isWord(String... words) {
        if (kind != Kind.WORD) return false;
        for (String w : words) if (norm.equals(w)) return true;
        return false;
    }

    public boolean isSymbol(String... symbols) {
        if (kind != Kind.SYMBOL) return false;
        for (String s : symbols) if (text.equals(s)) return true;
        return false;
    }

    @Override
    public String toString() {
        return kind + "(" + text + ")@" + line + ":" + col;
    }
}

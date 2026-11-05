package io.github.catalonec1.plsqllint.core;

import io.github.catalonec1.plsqllint.core.Finding.Fix;
import io.github.catalonec1.plsqllint.core.Finding.Severity;
import io.github.catalonec1.plsqllint.core.Token.Kind;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * All lint rules. PLL001-PLL015 are a port of the open-source Python rules
 * (same codes, messages and positions); PLL016+ are Pro rules.
 */
public final class Rules {

    /** Metadata of a rule. */
    public record Rule(String code, String name, Severity severity, String summary,
                       boolean pro, boolean optIn, Check check) {}

    @FunctionalInterface
    public interface Check {
        void run(Ctx ctx, Sink sink);
    }

    /** Collects raw results of one rule. */
    public interface Sink {
        void add(Token at, String message, Severity severity, Fix fix);

        default void add(Token at, String message) {
            add(at, message, null, null);
        }
    }

    /** Immutable stack node of open PL/SQL blocks. */
    public record Block(String word, Block parent, int depth) {
        static Block push(Block parent, String word) {
            return new Block(word, parent, parent == null ? 1 : parent.depth + 1);
        }

        static int depth(Block b) {
            return b == null ? 0 : b.depth;
        }

        static boolean contains(Block b, String word) {
            for (Block x = b; x != null; x = x.parent) if (x.word.equals(word)) return true;
            return false;
        }
    }

    /** Rule context: tokens without comments, raw lines, block structure. */
    public static final class Ctx {
        public final List<Token> toks;
        public final List<String> lines;
        public final int maxLineLength;
        public final String source;
        private Block[] blocks;

        Ctx(String source, List<Token> toks, int maxLineLength) {
            this.source = source;
            this.toks = toks;
            this.maxLineLength = maxLineLength;
            this.lines = splitLines(source);
        }

        /** For every token, the stack of open blocks before it. */
        Block[] blocks() {
            if (blocks == null) blocks = blockStacks(toks);
            return blocks;
        }

        int depth(int i) {
            return Block.depth(blocks()[i]);
        }

        Token next(int i) {
            return i + 1 < toks.size() ? toks.get(i + 1) : null;
        }

        Token prev(int i) {
            return i > 0 ? toks.get(i - 1) : null;
        }

        Token at(int i) {
            return i >= 0 && i < toks.size() ? toks.get(i) : null;
        }
    }

    /** Python's str.splitlines() for the separators that occur in source files. */
    static List<String> splitLines(String s) {
        List<String> out = new ArrayList<>();
        int start = 0, n = s.length();
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            if (c == '\n' || c == '\r' || c == 0x0B || c == '\f' || c == 0x1C || c == 0x1D || c == 0x1E
                    || c == 0x85 || c == 0x2028 || c == 0x2029) {
                out.add(s.substring(start, i));
                if (c == '\r' && i + 1 < n && s.charAt(i + 1) == '\n') i++;
                start = i + 1;
            }
        }
        if (start < n) out.add(s.substring(start));
        return out;
    }

    public static final Map<String, Rule> ALL;
    public static final Set<String> OPT_IN = Set.of("PLL009");

    static {
        Map<String, Rule> m = new LinkedHashMap<>();
        r(m, "PLL001", "when-others-no-raise", Severity.WARNING, "WHEN OTHERS handler that does not re-raise the error.", false, Rules::whenOthers);
        r(m, "PLL002", "select-star", Severity.WARNING, "SELECT * makes code break silently when columns change.", false, Rules::selectStar);
        r(m, "PLL003", "commit-in-loop", Severity.WARNING, "COMMIT or ROLLBACK inside a loop (slow, breaks atomicity, ORA-01555 risk).", false, Rules::commitInLoop);
        r(m, "PLL004", "compare-with-null", Severity.ERROR, "Comparison with NULL using = or <> is never true; use IS [NOT] NULL.", false, Rules::compareNull);
        r(m, "PLL005", "dynamic-sql-concat", Severity.WARNING, "Dynamic SQL built by concatenation (SQL injection risk, no plan reuse).", false, Rules::dynamicConcat);
        r(m, "PLL006", "dbms-output", Severity.INFO, "DBMS_OUTPUT left in code; use a logging package instead.", false, Rules::dbmsOutput);
        r(m, "PLL007", "goto", Severity.WARNING, "GOTO makes control flow hard to follow.", false, Rules::gotoRule);
        r(m, "PLL008", "rownum-order-by", Severity.WARNING, "ROWNUM filter combined with ORDER BY in the same query (filter runs first).", false, Rules::rownumOrderBy);
        r(m, "PLL009", "line-too-long", Severity.INFO, "Line longer than the configured maximum (default 120).", false, Rules::lineLength);
        r(m, "PLL010", "raise-app-error-range", Severity.ERROR, "RAISE_APPLICATION_ERROR number outside -20000..-20999 (raises ORA-21000).", false, Rules::raeRange);
        r(m, "PLL011", "end-without-name", Severity.INFO, "Named END without the unit name (END; instead of END my_proc;).", false, Rules::endName);
        r(m, "PLL012", "compare-with-empty-string", Severity.ERROR, "Comparison with '' is never true: Oracle treats the empty string as NULL.", false, Rules::emptyString);
        r(m, "PLL013", "varchar-type", Severity.INFO, "VARCHAR declared instead of VARCHAR2 (Oracle reserves VARCHAR for future semantics).", false, Rules::varchar);
        r(m, "PLL014", "not-in-subquery", Severity.WARNING, "NOT IN (SELECT ...) returns no rows when the subquery yields a NULL; prefer NOT EXISTS.", false, Rules::notIn);
        r(m, "PLL015", "to-date-no-format", Severity.WARNING, "TO_DATE / TO_TIMESTAMP without a format mask depends on NLS settings.", false, Rules::toDate);
        // ---- Pro rules
        r(m, "PLL016", "count-for-existence", Severity.INFO, "SELECT COUNT(*) INTO used to test existence; counts every row.", true, Rules::countExistence);
        r(m, "PLL017", "row-by-row-dml", Severity.WARNING, "INSERT/UPDATE/DELETE/MERGE inside a cursor FOR loop (slow-by-slow); use BULK COLLECT + FORALL.", true, Rules::rowByRow);
        r(m, "PLL018", "autonomous-no-commit", Severity.ERROR, "AUTONOMOUS_TRANSACTION unit with DML but no COMMIT/ROLLBACK (ORA-06519).", true, Rules::autonomous);
        r(m, "PLL019", "hardcoded-password", Severity.WARNING, "Password written in source with IDENTIFIED BY.", true, Rules::password);
        r(m, "PLL020", "dml-without-where", Severity.WARNING, "UPDATE or DELETE without a WHERE clause changes every row.", true, Rules::dmlWithoutWhere);
        ALL = Collections.unmodifiableMap(m);
    }

    private static void r(Map<String, Rule> m, String code, String name, Severity sev, String summary, boolean pro, Check c) {
        m.put(code, new Rule(code, name, sev, summary, pro, OPT_IN.contains(code), c));
    }

    private Rules() {}

    // ------------------------------------------------------------------ blocks
    private static final Set<String> OPENERS = Set.of("BEGIN", "CASE", "IF", "LOOP");

    static Block[] blockStacks(List<Token> toks) {
        Block[] out = new Block[toks.size()];
        Block stack = null;
        for (int i = 0; i < toks.size(); i++) {
            out[i] = stack;
            Token t = toks.get(i);
            if (t.kind != Kind.WORD) continue;
            String w = t.norm();
            if (OPENERS.contains(w)) {
                if (i > 0 && toks.get(i - 1).isWord("END")) continue;
                stack = Block.push(stack, w);
            } else if (w.equals("END") && stack != null) {
                stack = stack.parent;
            }
        }
        return out;
    }

    static int handlerEnd(Ctx ctx, int start, int depth) {
        for (int j = start; j < ctx.toks.size(); j++) {
            int d = ctx.depth(j);
            if (d == depth) {
                if (ctx.toks.get(j).isWord("WHEN", "END")) return j;
            } else if (d < depth) {
                return j;
            }
        }
        return ctx.toks.size();
    }

    // ------------------------------------------------------------------ PLL001
    static void whenOthers(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size() - 2; i++) {
            if (!(t.get(i).isWord("WHEN") && t.get(i + 1).isWord("OTHERS") && t.get(i + 2).isWord("THEN"))) continue;
            int bodyStart = i + 3;
            int end = handlerEnd(ctx, bodyStart, ctx.depth(i));
            boolean raises = false;
            List<Token> significant = new ArrayList<>();
            for (int k = bodyStart; k < end; k++) {
                Token b = t.get(k);
                if (b.isWord("RAISE", "RAISE_APPLICATION_ERROR")) raises = true;
                if (!b.isSymbol(";")) significant.add(b);
            }
            if (raises) continue;
            if (significant.size() == 1 && significant.get(0).isWord("NULL")) {
                sink.add(t.get(i), "WHEN OTHERS THEN NULL silently swallows every error; "
                        + "log and re-raise, or handle specific exceptions", Severity.ERROR, null);
            } else {
                sink.add(t.get(i), "WHEN OTHERS handler does not re-raise; add RAISE (or "
                        + "RAISE_APPLICATION_ERROR) after logging");
            }
        }
    }

    // ------------------------------------------------------------------ PLL002
    static void selectStar(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            if (!t.get(i).isWord("SELECT")) continue;
            int j = i + 1;
            if (j < t.size() && t.get(j).isWord("DISTINCT", "UNIQUE", "ALL")) j++;
            if (j < t.size() && t.get(j).isSymbol("*")) {
                if (insideExists(t, i)) continue;
                sink.add(t.get(j), "avoid SELECT *; list the columns you need");
            }
        }
    }

    static boolean insideExists(List<Token> t, int selectIdx) {
        int k = selectIdx - 1;
        while (k >= 0 && t.get(k).isSymbol("(")) k--;
        return k >= 0 && t.get(k).isWord("EXISTS");
    }

    // ------------------------------------------------------------------ PLL003
    static void commitInLoop(Ctx ctx, Sink sink) {
        Block[] b = ctx.blocks();
        for (int i = 0; i < ctx.toks.size(); i++) {
            Token tok = ctx.toks.get(i);
            if (tok.isWord("COMMIT", "ROLLBACK") && Block.contains(b[i], "LOOP")) {
                Token p = ctx.prev(i);
                if (p != null && p.isWord("ON", "PRESERVE", "DELETE")) continue;
                sink.add(tok, tok.norm() + " inside a loop; commit once after the loop or use bulk processing");
            }
        }
    }

    // ------------------------------------------------------------------ PLL004
    static final Set<String> COMPARE = Set.of("=", "<>", "!=", "^=", "~=");
    static final Set<String> CONDITION_START = Set.of("WHERE", "ON", "HAVING", "WHEN", "IF", "ELSIF", "WHILE", "AND",
            "OR", "NOT", "RETURN", "THEN", "ELSE", "BEGIN", "LOOP", "CHECK");

    static void compareNull(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            if (tok.kind != Kind.SYMBOL || !COMPARE.contains(tok.text)) continue;
            Token nxt = ctx.next(i), prv = ctx.prev(i);
            boolean right = nxt != null && nxt.isWord("NULL");
            boolean left = !right && prv != null && prv.isWord("NULL");
            if (!right && !left) continue;
            if (tok.text.equals("=") && inSetClause(t, i)) continue;
            String op = tok.text.equals("=") ? "IS NULL" : "IS NOT NULL";
            Fix fix = right ? new Fix("Replace with " + op, tok.offset, nxt.end() - tok.offset, op) : null;
            sink.add(tok, "'" + tok.text + " NULL' is never true; use " + op, null, fix);
        }
    }

    static boolean inSetClause(List<Token> t, int idx) {
        int depth = 0;
        for (int k = idx - 1; k >= 0; k--) {
            Token x = t.get(k);
            if (x.kind == Kind.SYMBOL) {
                if (x.text.equals(")")) depth++;
                else if (x.text.equals("(")) {
                    if (depth == 0) return false;
                    depth--;
                } else if (x.text.equals(";") && depth == 0) return false;
                continue;
            }
            if (depth > 0) continue;
            if (x.isWord("SET")) return true;
            if (x.kind == Kind.WORD && CONDITION_START.contains(x.norm())) return false;
        }
        return false;
    }

    // ------------------------------------------------------------------ PLL005
    static void dynamicConcat(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            int start = -1;
            if (tok.isWord("EXECUTE") && i + 1 < t.size() && t.get(i + 1).isWord("IMMEDIATE")) {
                start = i + 2;
            } else if (tok.isWord("FOR") && i >= 2 && t.get(i - 2).isWord("OPEN")) {
                Token nxt = ctx.next(i);
                if (nxt != null && !nxt.isWord("SELECT", "WITH") && !nxt.isSymbol("(")) start = i + 1;
            }
            if (start == -1) continue;
            boolean concat = false;
            for (int j = start; j < t.size(); j++) {
                Token x = t.get(j);
                if (x.isSymbol(";")) break;
                if (x.isWord("USING", "INTO", "BULK", "RETURNING", "RETURN")) break;
                if (x.isWord("DBMS_ASSERT")) {
                    concat = false;
                    break;
                }
                if (x.isSymbol("||")) concat = true;
            }
            if (concat) {
                sink.add(tok, "dynamic SQL built with '||'; use bind variables (USING) and DBMS_ASSERT for identifiers");
            }
        }
    }

    // ------------------------------------------------------------------ PLL006
    static void dbmsOutput(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            if (t.get(i).isWord("DBMS_OUTPUT") && i + 1 < t.size() && t.get(i + 1).text.equals(".")) {
                sink.add(t.get(i), "DBMS_OUTPUT call; remove debug output or use a logger");
            }
        }
    }

    // ------------------------------------------------------------------ PLL007
    static void gotoRule(Ctx ctx, Sink sink) {
        for (Token tok : ctx.toks) {
            if (tok.isWord("GOTO")) sink.add(tok, "avoid GOTO; restructure with loops, EXIT or procedures");
        }
    }

    // ------------------------------------------------------------------ PLL008
    static void rownumOrderBy(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        // frame: [where?, rownum token]
        List<Object[]> frames = new ArrayList<>();
        frames.add(new Object[]{false, null});
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            Object[] f = frames.get(frames.size() - 1);
            if (tok.kind == Kind.SYMBOL) {
                if (tok.text.equals("(")) frames.add(new Object[]{false, null});
                else if (tok.text.equals(")") && frames.size() > 1) frames.remove(frames.size() - 1);
                else if (tok.text.equals(";")) {
                    frames.clear();
                    frames.add(new Object[]{false, null});
                }
                continue;
            }
            if (tok.isWord("SELECT")) {
                f[0] = false;
                f[1] = null;
            } else if (tok.isWord("WHERE")) {
                f[0] = true;
            } else if (tok.isWord("ROWNUM") && (Boolean) f[0] && f[1] == null) {
                f[1] = tok;
            } else if (tok.isWord("ORDER") && f[1] != null) {
                Token nxt = ctx.next(i);
                if (nxt != null && nxt.isWord("BY", "SIBLINGS")) {
                    sink.add((Token) f[1], "ROWNUM is applied before ORDER BY; sort in a subquery or use FETCH FIRST n ROWS ONLY");
                    f[1] = null;
                }
            }
        }
    }

    // ------------------------------------------------------------------ PLL009
    static void lineLength(Ctx ctx, Sink sink) {
        int lineStart = 0;
        int no = 0;
        for (String text : ctx.lines) {
            no++;
            int width = text.length();
            if (width > ctx.maxLineLength) {
                int off = lineOffset(ctx.source, no);
                Token pseudo = new Token(Kind.SYMBOL, text.substring(ctx.maxLineLength), no, ctx.maxLineLength + 1,
                        off + ctx.maxLineLength);
                sink.add(pseudo, "line is " + width + " characters long (max " + ctx.maxLineLength + ")");
            }
        }
    }

    static int lineOffset(String src, int line) {
        int off = 0;
        for (int l = 1; l < line; l++) {
            int nl = src.indexOf('\n', off);
            if (nl == -1) return src.length();
            off = nl + 1;
        }
        return off;
    }

    // ------------------------------------------------------------------ PLL010
    static void raeRange(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            if (!t.get(i).isWord("RAISE_APPLICATION_ERROR")) continue;
            if (i + 1 >= t.size() || !t.get(i + 1).text.equals("(")) continue;
            int j = i + 2;
            int sign = 1;
            if (j < t.size() && t.get(j).kind == Kind.SYMBOL && (t.get(j).text.equals("+") || t.get(j).text.equals("-"))) {
                sign = t.get(j).text.equals("-") ? -1 : 1;
                j++;
            }
            if (j < t.size() && t.get(j).kind == Kind.NUMBER) {
                long value;
                try {
                    value = sign * Long.parseLong(t.get(j).text);
                } catch (NumberFormatException e) {
                    continue;
                }
                if (value < -20999 || value > -20000) {
                    sink.add(t.get(j), "error number " + value + " is outside -20000..-20999");
                }
            }
        }
    }

    // ------------------------------------------------------------------ PLL011
    static void endName(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        int i = 0;
        while (i < t.size()) {
            if (t.get(i).isWord("CREATE")) {
                int j = i + 1;
                while (j < t.size() && t.get(j).isWord("OR", "REPLACE", "EDITIONABLE", "NONEDITIONABLE")) j++;
                if (j < t.size() && t.get(j).isWord("PROCEDURE", "FUNCTION", "PACKAGE", "TRIGGER")) {
                    int k = j + 1;
                    if (k < t.size() && t.get(k).isWord("BODY")) k++;
                    int nameIdx = k;
                    while (nameIdx + 2 < t.size() && t.get(nameIdx + 1).text.equals(".")) nameIdx += 2;
                    int endIdx = unitEnd(t, nameIdx);
                    if (endIdx != -1) {
                        Token after = endIdx + 1 < t.size() ? t.get(endIdx + 1) : null;
                        if (after != null && after.text.equals(";") && nameIdx < t.size()) {
                            String name = t.get(nameIdx).text;
                            Token end = t.get(endIdx);
                            sink.add(end, "add the unit name after END (END " + name + ";) for readability", null,
                                    new Fix("Add unit name after END", end.end(), 0, " " + name));
                        }
                        i = endIdx;
                    }
                }
            }
            i++;
        }
    }

    static int unitEnd(List<Token> t, int start) {
        for (int k = start; k < t.size(); k++) {
            Token x = t.get(k);
            if (x.isSymbol("/") && k > 0 && t.get(k - 1).text.equals(";")) {
                int e = k - 2;
                if (e >= 0 && t.get(e).isWord("END")) return e;
                return -1;
            }
            if (x.isWord("CREATE") && k > start) return -1;
        }
        return -1;
    }

    // ------------------------------------------------------------------ PLL012
    static void emptyString(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            if (tok.kind != Kind.SYMBOL || !COMPARE.contains(tok.text)) continue;
            Token[] sides = {ctx.next(i), ctx.prev(i)};
            for (int s = 0; s < 2; s++) {
                Token side = sides[s];
                if (side != null && side.kind == Kind.STRING
                        && (side.text.equals("''") || side.text.equals("N''") || side.text.equals("n''"))) {
                    if (tok.text.equals("=") && inSetClause(t, i)) break;
                    String op = tok.text.equals("=") ? "IS NULL" : "IS NOT NULL";
                    Fix fix = s == 0 ? new Fix("Replace with " + op, tok.offset, side.end() - tok.offset, op) : null;
                    sink.add(tok, "'' is NULL in Oracle, so '" + tok.text + " ''' is never true; use " + op, null, fix);
                    break;
                }
            }
        }
    }

    // ------------------------------------------------------------------ PLL013
    static void varchar(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            if (!tok.isWord("VARCHAR")) continue;
            Token nxt = ctx.next(i);
            if (nxt != null && nxt.isSymbol("(", ";", ",", ":=")) {
                sink.add(tok, "use VARCHAR2 instead of VARCHAR", null,
                        new Fix("Replace with VARCHAR2", tok.offset, tok.text.length(),
                                Character.isLowerCase(tok.text.charAt(0)) ? "varchar2" : "VARCHAR2"));
            }
        }
    }

    // ------------------------------------------------------------------ PLL014
    static void notIn(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size() - 3; i++) {
            if (t.get(i).isWord("NOT") && t.get(i + 1).isWord("IN") && t.get(i + 2).text.equals("(")
                    && t.get(i + 3).isWord("SELECT", "WITH")) {
                sink.add(t.get(i), "NOT IN with a subquery matches nothing if the subquery returns a NULL; "
                        + "use NOT EXISTS or filter NULLs in the subquery");
            }
        }
    }

    // ------------------------------------------------------------------ PLL015
    static void toDate(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            if (!tok.isWord("TO_DATE", "TO_TIMESTAMP", "TO_TIMESTAMP_TZ")) continue;
            if (i + 1 >= t.size() || !t.get(i + 1).text.equals("(")) continue;
            int depth = 0, args = 1;
            for (int j = i + 1; j < t.size(); j++) {
                Token x = t.get(j);
                if (x.kind != Kind.SYMBOL) continue;
                if (x.text.equals("(")) depth++;
                else if (x.text.equals(")")) {
                    depth--;
                    if (depth == 0) break;
                } else if (x.text.equals(",") && depth == 1) args++;
                else if (x.text.equals(";")) break;
            }
            if (args == 1) {
                sink.add(tok, tok.norm() + " without a format mask uses NLS_DATE_FORMAT; pass an explicit mask, e.g. "
                        + tok.norm() + "(x, 'YYYY-MM-DD')");
            }
        }
    }

    // ================================================================== Pro rules

    // ------------------------------------------------------------------ PLL016
    static void countExistence(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i + 5 < t.size(); i++) {
            if (t.get(i).isWord("SELECT") && t.get(i + 1).isWord("COUNT") && t.get(i + 2).isSymbol("(")
                    && (t.get(i + 3).isSymbol("*") || t.get(i + 3).kind == Kind.NUMBER)
                    && t.get(i + 4).isSymbol(")") && t.get(i + 5).isWord("INTO")) {
                // Only flag when the count is later compared with 0 (existence test).
                Token var = ctx.at(i + 6);
                if (var == null || var.kind != Kind.WORD) continue;
                if (comparedWithZero(t, i + 7, var.norm())) {
                    sink.add(t.get(i + 1), "COUNT(*) INTO " + var.text + " only to test existence counts every row; "
                            + "use EXISTS or add AND ROWNUM = 1");
                }
            }
        }
    }

    private static boolean comparedWithZero(List<Token> t, int from, String var) {
        for (int k = from; k + 2 < t.size() && k < from + 400; k++) {
            if (!t.get(k).isWord(var)) continue;
            Token op = t.get(k + 1), val = t.get(k + 2);
            if (op.isSymbol(">", "=", "<>", "!=", ">=") && val.kind == Kind.NUMBER
                    && (val.text.equals("0") || (val.text.equals("1") && op.text.equals(">=")))) return true;
            if (op.isSymbol("<") && val.kind == Kind.NUMBER && val.text.equals("1")) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ PLL017
    static void rowByRow(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        // Per token: number of enclosing cursor FOR loops.
        List<Boolean> loopStack = new ArrayList<>(); // true = cursor FOR loop, for every open block
        int cursorLoops = 0;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            if (tok.kind == Kind.WORD) {
                String w = tok.norm();
                if (OPENERS.contains(w) && !(i > 0 && t.get(i - 1).isWord("END"))) {
                    boolean cursorFor = w.equals("LOOP") && isCursorForLoop(t, i);
                    loopStack.add(cursorFor);
                    if (cursorFor) cursorLoops++;
                    continue;
                }
                if (w.equals("END") && !loopStack.isEmpty()) {
                    if (loopStack.remove(loopStack.size() - 1)) cursorLoops--;
                    continue;
                }
                if (cursorLoops > 0 && tok.isWord("INSERT", "UPDATE", "DELETE", "MERGE") && startsStatement(t, i)) {
                    sink.add(tok, tok.norm() + " inside a cursor FOR loop runs once per row; "
                            + "use BULK COLLECT ... LIMIT with FORALL, or a single set-based statement");
                }
            }
        }
    }

    /** LOOP at {@code loopIdx} belongs to "FOR rec IN cursor|(SELECT ...)" (not a numeric range). */
    private static boolean isCursorForLoop(List<Token> t, int loopIdx) {
        int depth = 0;
        boolean sawIn = false;
        for (int k = loopIdx - 1; k >= 0 && k > loopIdx - 2000; k--) {
            Token x = t.get(k);
            if (x.isSymbol(")")) depth++;
            else if (x.isSymbol("(")) depth--;
            if (depth > 0) continue;
            if (x.isSymbol("..")) return false;
            if (x.isWord("IN") && depth == 0) sawIn = true;
            if (x.isWord("REVERSE")) return false;
            if (x.isSymbol(";") || x.isWord("BEGIN", "THEN", "ELSE", "LOOP", "IS", "AS", "DECLARE")) return false;
            if (x.isWord("FOR")) {
                Token p = k > 0 ? t.get(k - 1) : null;
                // ">> FOR" labels and plain statement starts are fine; "OPEN c FOR" is not a loop
                return sawIn && !(p != null && p.kind == Kind.WORD && k >= 2 && t.get(k - 2).isWord("OPEN"));
            }
            if (x.isWord("WHILE")) return false;
        }
        return false;
    }

    private static boolean startsStatement(List<Token> t, int i) {
        Token p = i > 0 ? t.get(i - 1) : null;
        return p == null || p.isSymbol(";", ">>") || p.isWord("LOOP", "THEN", "ELSE", "BEGIN");
    }

    // ------------------------------------------------------------------ PLL018
    static void autonomous(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i + 1 < t.size(); i++) {
            if (!(t.get(i).isWord("PRAGMA") && t.get(i + 1).isWord("AUTONOMOUS_TRANSACTION"))) continue;
            int depth = ctx.depth(i);
            int begin = -1;
            for (int k = i + 2; k < t.size(); k++) {
                if (t.get(k).isWord("BEGIN") && ctx.depth(k) == depth) {
                    begin = k;
                    break;
                }
            }
            if (begin == -1) continue;
            boolean dml = false, txEnd = false;
            int k = begin + 1;
            for (; k < t.size() && ctx.depth(k) > depth; k++) {
                Token x = t.get(k);
                if (x.isWord("INSERT", "UPDATE", "DELETE", "MERGE") && startsStatement(t, k)) dml = true;
                if (x.isWord("COMMIT", "ROLLBACK")) txEnd = true;
            }
            if (dml && !txEnd) {
                sink.add(t.get(i + 1), "autonomous transaction does DML but never COMMITs or ROLLBACKs; "
                        + "it fails with ORA-06519 on return");
            }
        }
    }

    // ------------------------------------------------------------------ PLL019
    static void password(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        for (int i = 0; i + 2 < t.size(); i++) {
            if (!(t.get(i).isWord("IDENTIFIED") && t.get(i + 1).isWord("BY"))) continue;
            Token pw = t.get(i + 2);
            if (pw.isWord("VALUES")) continue;
            if (pw.kind == Kind.WORD || pw.kind == Kind.QUOTED || pw.kind == Kind.STRING) {
                sink.add(pw, "password written in source; pass it at deploy time (substitution variable or vault)");
            }
        }
    }

    // ------------------------------------------------------------------ PLL020
    static void dmlWithoutWhere(Ctx ctx, Sink sink) {
        List<Token> t = ctx.toks;
        boolean inMerge = false;
        for (int i = 0; i < t.size(); i++) {
            Token tok = t.get(i);
            if (tok.isSymbol(";")) {
                inMerge = false;
                continue;
            }
            if (tok.isWord("MERGE") && startsStatement(t, i)) inMerge = true;
            if (inMerge || !tok.isWord("UPDATE", "DELETE") || !startsStatement(t, i)) continue;
            Token nxt = ctx.next(i);
            if (nxt == null || nxt.isWord("ON", "OF", "OR") || nxt.isSymbol(",", ")", ";")) continue;
            int depth = 0;
            boolean where = false, complete = false;
            for (int j = i + 1; j < t.size(); j++) {
                Token x = t.get(j);
                if (x.isSymbol("(")) depth++;
                else if (x.isSymbol(")")) {
                    if (--depth < 0) break;
                } else if (depth == 0 && x.isSymbol(";", "/")) {
                    complete = true;
                    break;
                } else if (depth == 0 && x.isWord("WHERE")) {
                    where = true;
                    break;
                } else if (depth == 0 && x.isWord("RETURNING", "RETURN", "LOG")) {
                    complete = true;
                    break;
                }
            }
            if (complete && !where) {
                sink.add(tok, tok.norm() + " without WHERE affects every row of the table; "
                        + "add a WHERE clause or use TRUNCATE deliberately");
            }
        }
    }
}

package io.github.catalonec1.plsqllint.core;

import io.github.catalonec1.plsqllint.core.Finding.Severity;
import io.github.catalonec1.plsqllint.core.Token.Kind;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Runs rules over source text, honouring the same inline suppressions as the CLI. */
public final class Linter {
    private static final Pattern DIRECTIVE = Pattern.compile(
            "plsql-lint:\\s*(disable-file|disable)(?:\\s*=\\s*([A-Za-z0-9_,\\s]+))?", Pattern.CASE_INSENSITIVE);
    private static final Pattern NOQA = Pattern.compile(
            "\\bnoqa\\b(?::\\s*([A-Za-z0-9_,\\s]+))?", Pattern.CASE_INSENSITIVE);
    private static final String ALL = "*";

    /** Which rules run. */
    public static final class Config {
        public final Set<String> select = new TreeSet<>();
        public final Set<String> ignore = new HashSet<>();
        public int maxLineLength = 120;

        /** Default: every rule except opt-in ones; Pro rules included when {@code pro}. */
        public static Config defaults(boolean pro) {
            Config c = new Config();
            for (Rules.Rule r : Rules.ALL.values()) {
                if (!r.optIn() && (pro || !r.pro())) c.select.add(r.code());
            }
            return c;
        }

        List<String> enabled() {
            List<String> out = new ArrayList<>();
            for (String c : select) if (Rules.ALL.containsKey(c) && !ignore.contains(c)) out.add(c);
            return out;
        }
    }

    private Linter() {}

    public static List<Finding> lint(String source) {
        return lint(source, Config.defaults(false));
    }

    public static List<Finding> lint(String source, Config config) {
        List<Token> all = Tokenizer.tokenize(source);
        List<Token> toks = new ArrayList<>(all.size());
        Map<Integer, Set<String>> lineOff = new HashMap<>();
        Set<String> fileOff = new HashSet<>();
        for (Token t : all) {
            if (t.kind != Kind.COMMENT) {
                toks.add(t);
                continue;
            }
            Matcher m = DIRECTIVE.matcher(t.text);
            while (m.find()) {
                Set<String> codes = codes(m.group(2));
                if (m.group(1).equalsIgnoreCase("disable-file")) fileOff.addAll(codes);
                else lineOff.computeIfAbsent(t.line, k -> new HashSet<>()).addAll(codes);
            }
            Matcher q = NOQA.matcher(t.text);
            while (q.find()) lineOff.computeIfAbsent(t.line, k -> new HashSet<>()).addAll(codes(q.group(1)));
        }

        Rules.Ctx ctx = new Rules.Ctx(source, toks, config.maxLineLength);
        List<Finding> out = new ArrayList<>();
        for (String code : config.enabled()) {
            if (fileOff.contains(ALL) || fileOff.contains(code)) continue;
            Rules.Rule rule = Rules.ALL.get(code);
            rule.check().run(ctx, (at, message, severity, fix) -> {
                Set<String> off = lineOff.getOrDefault(at.line, Set.of());
                if (off.contains(ALL) || off.contains(code)) return;
                Severity sev = severity != null ? severity : rule.severity();
                int len = Math.max(1, at.text.length());
                if (at.offset + len > source.length()) len = Math.max(0, source.length() - at.offset);
                out.add(new Finding(code, message, sev, at.line, at.col, at.offset, len, fix));
            });
        }
        out.sort(Comparator.comparingInt(Finding::line).thenComparingInt(Finding::col).thenComparing(Finding::code));
        return out;
    }

    private static Set<String> codes(String raw) {
        Set<String> out = new HashSet<>();
        if (raw == null || raw.isEmpty()) {
            out.add(ALL);
            return out;
        }
        for (String c : raw.split(",")) {
            String s = c.strip().toUpperCase(Locale.ROOT);
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }
}

package io.github.catalonec1.oraerrors.core;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Finds ORA-/PLS-/TNS- error codes in arbitrary text (stack traces, logs, SQL*Plus output). */
public final class OraScanner {
    private static final Pattern CODE = Pattern.compile("(?i)\\b(ORA|PLS|TNS)[-_ ]?(\\d{1,5})\\b");

    private OraScanner() {}

    /** A code found in text, with its position. */
    public record Hit(String code, int start, int end) {}

    /** All hits in order of appearance (duplicates included). */
    public static List<Hit> scan(CharSequence text) {
        List<Hit> hits = new ArrayList<>();
        if (text == null) return hits;
        Matcher m = CODE.matcher(text);
        while (m.find()) {
            hits.add(new Hit(normalize(m.group(1), m.group(2)), m.start(), m.end()));
        }
        return hits;
    }

    /** Distinct codes in order of first appearance. */
    public static List<String> distinctCodes(CharSequence text) {
        Set<String> seen = new LinkedHashSet<>();
        for (Hit h : scan(text)) seen.add(h.code());
        return new ArrayList<>(seen);
    }

    /** The code under/around {@code offset} (e.g. the caret), or null. */
    public static String codeAt(CharSequence text, int offset) {
        if (text == null) return null;
        int from = Math.max(0, offset - 12);
        int to = Math.min(text.length(), offset + 12);
        for (Hit h : scan(text.subSequence(from, to))) {
            int s = h.start() + from, e = h.end() + from;
            if (offset >= s && offset <= e) return h.code();
        }
        return null;
    }

    static String normalize(String prefix, String digits) {
        String p = prefix.toUpperCase(Locale.ROOT);
        int n = Integer.parseInt(digits);
        return p + "-" + String.format(Locale.ROOT, "%05d", n);
    }

    /** Normalises user input such as "1403", "ora 1403", "pls-103"; null if it is not a code. */
    public static String normalizeLoose(String input) {
        if (input == null) return null;
        String s = input.trim();
        if (s.matches("\\d{1,5}")) return normalize("ORA", s);
        Matcher m = CODE.matcher(s);
        if (m.matches()) return normalize(m.group(1), m.group(2));
        return null;
    }
}

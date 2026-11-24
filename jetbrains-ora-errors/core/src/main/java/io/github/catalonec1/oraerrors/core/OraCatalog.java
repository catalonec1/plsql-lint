package io.github.catalonec1.oraerrors.core;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The bundled catalogue of Oracle errors (errors.tsv: code, F/P, title, cause, fix). */
public final class OraCatalog {
    private static volatile OraCatalog instance;

    private final Map<String, OraError> byCode = new LinkedHashMap<>();

    OraCatalog(List<OraError> entries) {
        for (OraError e : entries) byCode.put(e.code(), e);
    }

    public static OraCatalog get() {
        OraCatalog c = instance;
        if (c == null) {
            synchronized (OraCatalog.class) {
                if (instance == null) instance = load();
                c = instance;
            }
        }
        return c;
    }

    private static OraCatalog load() {
        try (InputStream in = OraCatalog.class.getResourceAsStream("errors.tsv")) {
            if (in == null) throw new IllegalStateException("errors.tsv missing from the plugin jar");
            BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            List<OraError> list = new ArrayList<>();
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                String[] c = line.split("\t", -1);
                if (c.length != 5) throw new IllegalStateException("bad catalogue line: " + line);
                list.add(new OraError(c[0], "F".equals(c[1]), c[2], c[3], c[4]));
            }
            return new OraCatalog(list);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public List<OraError> all() {
        return List.copyOf(byCode.values());
    }

    public int size() {
        return byCode.size();
    }

    public long freeCount() {
        return byCode.values().stream().filter(OraError::free).count();
    }

    /**
     * Looks up a normalised code (see {@link OraScanner#normalize}). ORA-20000..ORA-20999 map to the
     * ORA-20000 "user-defined error" entry; TNS-nnnnn maps to ORA-nnnnn.
     */
    public OraError find(String code) {
        if (code == null) return null;
        String c = code.toUpperCase(Locale.ROOT);
        OraError e = byCode.get(c);
        if (e != null) return e;
        if (c.startsWith("TNS-")) return byCode.get("ORA-" + c.substring(4));
        if (c.startsWith("ORA-")) {
            try {
                int n = Integer.parseInt(c.substring(4));
                if (n >= 20000 && n <= 20999) return byCode.get("ORA-20000");
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        return null;
    }

    /** Case-insensitive search in code, title, cause and fix; code matches first, then title, then text. */
    public List<OraError> search(String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (q.isEmpty()) return all();
        String asCode = OraScanner.normalizeLoose(q);
        List<OraError> codeHits = new ArrayList<>();
        List<OraError> titleHits = new ArrayList<>();
        List<OraError> textHits = new ArrayList<>();
        for (OraError e : byCode.values()) {
            String code = e.code().toLowerCase(Locale.ROOT);
            if (code.contains(q) || (asCode != null && e.code().equals(asCode))
                    || code.replace("-", "").contains(q.replace("-", "").replace(" ", ""))) {
                codeHits.add(e);
            } else if (e.title().toLowerCase(Locale.ROOT).contains(q)) {
                titleHits.add(e);
            } else if (e.cause().toLowerCase(Locale.ROOT).contains(q) || e.fix().toLowerCase(Locale.ROOT).contains(q)) {
                textHits.add(e);
            }
        }
        List<OraError> out = new ArrayList<>(codeHits);
        out.addAll(titleHits);
        out.addAll(textHits);
        return Collections.unmodifiableList(out);
    }
}

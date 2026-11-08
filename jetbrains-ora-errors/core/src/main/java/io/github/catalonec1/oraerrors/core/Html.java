package io.github.catalonec1.oraerrors.core;

import java.util.List;

/** HTML for the tool window and popups (kept here so it is unit-tested without the IDE). */
public final class Html {
    private Html() {}

    public static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    /** One entry. When {@code locked}, only the title and a Pro teaser are shown. */
    public static String entry(OraError e, boolean locked) {
        StringBuilder b = new StringBuilder();
        b.append("<h3 style='margin:0 0 6px 0'>").append(esc(e.code())).append(" &ndash; ").append(esc(e.title())).append("</h3>");
        if (locked) {
            b.append("<p><b>Pro entry.</b> The cause and the fix for this error are part of ORA Error Helper Pro ")
             .append("(<a href='pro:register'>start the free trial or register</a>).</p>");
            return b.toString();
        }
        b.append("<p><b>Cause.</b> ").append(esc(e.cause())).append("</p>");
        b.append("<p><b>Fix.</b> ").append(esc(e.fix())).append("</p>");
        return b.toString();
    }

    /** Several entries (stack trace explanation); unknown codes are listed at the end. */
    public static String stack(List<OraError> known, List<String> unknown, boolean pro) {
        StringBuilder b = new StringBuilder("<html><body style='padding:6px'>");
        if (known.isEmpty() && unknown.isEmpty()) {
            b.append("<p>No ORA-, PLS- or TNS- error codes found.</p>");
        }
        for (OraError e : known) {
            b.append(entry(e, !pro && !e.free())).append("<hr/>");
        }
        if (!unknown.isEmpty()) {
            b.append("<p>Not in the catalogue: ").append(esc(String.join(", ", unknown))).append("</p>");
        }
        return b.append("</body></html>").toString();
    }
}

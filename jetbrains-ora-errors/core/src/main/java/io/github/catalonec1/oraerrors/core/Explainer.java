package io.github.catalonec1.oraerrors.core;

import java.util.ArrayList;
import java.util.List;

/** Turns any text (a code, a log line, a whole stack trace) into explanation HTML. */
public final class Explainer {
    private Explainer() {}

    public static String explain(String text, boolean pro) {
        OraCatalog cat = OraCatalog.get();
        List<OraError> known = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        for (String c : OraScanner.distinctCodes(text)) {
            OraError err = cat.find(c);
            if (err == null) unknown.add(c);
            else if (!known.contains(err)) known.add(err);
        }
        if (!pro && known.size() > 1) {
            List<String> rest = known.subList(1, known.size()).stream().map(OraError::code).toList();
            String html = Html.stack(List.of(known.get(0)), unknown, false);
            return html.replace("</body>", "<p><b>Also in this text:</b> " + Html.esc(String.join(", ", rest))
                    + ". Explaining a whole stack trace at once is part of Pro "
                    + "(<a href='pro:register'>start the free trial</a>), or select one code at a time.</p></body>");
        }
        return Html.stack(known, unknown, pro);
    }
}

package io.github.catalonec1.planreader.core;

import io.github.catalonec1.planreader.core.Finding.Severity;

import java.util.List;
import java.util.Map;

/** HTML report for the tool window (Swing HTML 3.2 subset). */
public final class Report {
    private Report() {}

    public static String html(Plan plan, List<Finding> all, boolean pro) {
        StringBuilder b = new StringBuilder("<html><body>");
        if (plan.lines().isEmpty()) {
            b.append("<p>No plan table found. Paste the output of <code>SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY)</code> or ")
             .append("<code>DBMS_XPLAN.DISPLAY_CURSOR(format =&gt; 'ALLSTATS LAST')</code>, including the lines that ")
             .append("start with |.</p></body></html>");
            return b.toString();
        }
        List<Finding> shown = all.stream().filter(f -> pro || !f.pro()).toList();
        long hidden = all.size() - shown.size();

        b.append("<p><b>").append(plan.lines().size()).append(" steps</b>");
        if (plan.planHash() != null) b.append(", plan hash ").append(esc(plan.planHash()));
        if (plan.root().cost >= 0) b.append(", total cost ").append(plan.root().cost);
        b.append(plan.hasActuals() ? ", with actual row counts" : ", estimates only").append(".</p>");

        b.append("<h3>Findings</h3>");
        if (shown.isEmpty()) b.append("<p>Nothing stands out").append(hidden > 0 ? " in the free checks" : "").append(".</p>");
        b.append("<table cellpadding='3' cellspacing='0'>");
        for (Finding f : shown) {
            b.append("<tr><td valign='top'><font color='").append(color(f.severity())).append("'><b>")
             .append(f.severity()).append("</b></font></td><td valign='top'>").append(f.lineId() >= 0 ? "Id " + f.lineId() : "Plan")
             .append("</td><td><b>").append(esc(f.title())).append("</b><br>").append(esc(f.advice())).append("</td></tr>");
        }
        b.append("</table>");
        if (hidden > 0) {
            b.append("<p><b>").append(hidden).append(" more finding(s)</b> from the Pro checks (estimate errors, ")
             .append("implicit conversions, nested loops over big row sources, missing partition pruning, temp spills, ")
             .append("dynamic statistics...). <a href='pro:register'>Start the free trial or register</a>.</p>");
        }

        Map<Integer, Severity> worst = new java.util.HashMap<>();
        for (Finding f : shown) worst.merge(f.lineId(), f.severity(), (a, c) -> a.ordinal() <= c.ordinal() ? a : c);
        long total = Math.max(1, plan.root().cost);
        b.append("<h3>Plan</h3><table cellpadding='2' cellspacing='0'><tr><th align='left'>Id</th><th align='left'>Operation</th>")
         .append("<th align='left'>Name</th><th align='right'>").append(plan.hasActuals() ? "A-Rows" : "Rows")
         .append("</th><th align='right'>Cost</th><th align='right'>Self %</th></tr>");
        for (PlanLine l : plan.lines()) {
            Severity s = worst.get(l.id);
            String c = s == null ? null : color(s);
            b.append("<tr><td>").append(l.hasPredicate ? "*" : "").append(l.id).append("</td><td>")
             .append("&nbsp;".repeat(2 * l.depth));
            if (c != null) b.append("<font color='").append(c).append("'><b>");
            b.append(esc(l.operation));
            if (c != null) b.append("</b></font>");
            long rows = PlanAnalyzer.effectiveRows(l);
            long self = l.selfCost();
            b.append("</td><td>").append(esc(l.name)).append("</td><td align='right'>").append(rows >= 0 ? PlanAnalyzer.human(rows) : "")
             .append("</td><td align='right'>").append(l.cost >= 0 ? l.cost : "")
             .append("</td><td align='right'>").append(self > 0 ? Math.round(100.0 * self / total) + "%" : "").append("</td></tr>");
            for (String p : plan.predicatesOf(l.id)) {
                b.append("<tr><td></td><td colspan='5'><font size='-1'>").append("&nbsp;".repeat(2 * l.depth + 2))
                 .append(esc(p)).append("</font></td></tr>");
            }
        }
        b.append("</table>");
        if (!plan.notes().isEmpty()) {
            b.append("<h3>Notes</h3><ul>");
            for (String n : plan.notes()) b.append("<li>").append(esc(n)).append("</li>");
            b.append("</ul>");
        }
        return b.append("</body></html>").toString();
    }

    static String color(Severity s) {
        return switch (s) {
            case ERROR -> "#E05555";
            case WARNING -> "#D9A343";
            case INFO -> "#5394EC";
        };
    }

    static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}

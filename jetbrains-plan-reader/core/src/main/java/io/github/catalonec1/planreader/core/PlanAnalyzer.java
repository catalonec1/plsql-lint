package io.github.catalonec1.planreader.core;

import io.github.catalonec1.planreader.core.Finding.Severity;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Heuristic checks on a parsed plan. PR01-PR03 are free; PR04-PR15 are Pro. The thresholds are rules of thumb,
 * so every finding is phrased as something to look at, not as a verdict.
 */
public final class PlanAnalyzer {
    static final long BIG_ROWS = 10_000;
    private static final String COL = "\"[A-Z0-9_$#]+\"(?:\\.\"[A-Z0-9_$#]+\")?";
    private static final Pattern CONVERSION = Pattern.compile(
            "INTERNAL_FUNCTION\\(" + COL + "\\)|TO_(?:NUMBER|BINARY_DOUBLE|BINARY_FLOAT|TIMESTAMP|DATE)\\(" + COL);
    private static final Pattern FUNC_ON_COL = Pattern.compile(
            "\\b(UPPER|LOWER|TRUNC|NVL|NVL2|SUBSTR|COALESCE|TO_CHAR|TRIM|LTRIM|RTRIM|DECODE)\\(" + COL);
    private static final Pattern LEADING_WILDCARD = Pattern.compile("LIKE\\s+'%");

    private PlanAnalyzer() {}

    public static List<Finding> analyze(Plan plan) {
        List<Finding> out = new ArrayList<>();
        PlanLine root = plan.root();
        if (root == null) return out;
        long total = root.cost;

        // PR01 hot spot (free)
        if (total > 0) {
            PlanLine hot = plan.lines().stream().max(Comparator.comparingLong(PlanLine::selfCost)).orElse(null);
            if (hot != null && hot.selfCost() > 0) {
                long pct = Math.round(100.0 * hot.selfCost() / total);
                out.add(new Finding("PR01", pct >= 50 ? Severity.WARNING : Severity.INFO, hot.id, false,
                        "Most expensive step: " + hot + " (" + pct + "% of the total cost " + total + ")",
                        "Start tuning here. Check its predicates and the access path it uses."));
            }
        }
        for (PlanLine l : plan.lines()) {
            long rows = effectiveRows(l);
            // PR02 full scan of a big table (free)
            if ((l.is("TABLE ACCESS FULL") || l.is("TABLE ACCESS STORAGE FULL")) && rows >= BIG_ROWS) {
                out.add(new Finding("PR02", Severity.WARNING, l.id, false,
                        "Full table scan of " + l.name + " returning about " + human(rows) + " rows",
                        "Fine when most of the table is needed. Otherwise check for a missing index on the filter "
                                + "columns, or a predicate that prevents index use."));
            }
            // PR03 cartesian product (free)
            if (l.operation.contains("CARTESIAN")) {
                out.add(new Finding("PR03", Severity.ERROR, l.id, false,
                        "Cartesian product at " + l,
                        "Usually a missing join condition. If intended (very small row sources) it is fine; "
                                + "otherwise add the join predicate between the two tables."));
            }
            // PR04 cardinality misestimate (Pro)
            if (l.actualRows >= 0 && l.rows >= 0) {
                long est = l.rows * Math.max(1, l.starts);
                long act = l.actualRows;
                long hi = Math.max(est, act), lo = Math.max(1, Math.min(est, act));
                if (hi >= 100 && hi / lo >= 10) {
                    out.add(new Finding("PR04", Severity.WARNING, l.id, true,
                            "Estimate off by " + (hi / lo) + "x at " + l + " (estimated " + human(est) + ", actual " + human(act) + ")",
                            "Wrong estimates lead to wrong join orders and methods. Gather statistics "
                                    + "(DBMS_STATS.GATHER_TABLE_STATS), add histograms or extended statistics for correlated "
                                    + "columns, and check bind peeking."));
                }
            }
            for (String p : plan.predicatesOf(l.id)) {
                String up = p.toUpperCase(Locale.ROOT);
                // PR05 implicit / explicit conversion of a column (Pro)
                if (CONVERSION.matcher(up).find()) {
                    out.add(new Finding("PR05", Severity.WARNING, l.id, true,
                            "Data type conversion on a column at " + l + ": " + shorten(p),
                            "A conversion applied to the column disables a normal index on it. Compare with a value of "
                                    + "the column's own type (bind a VARCHAR2 for VARCHAR2 columns, a DATE for DATE columns)."));
                } else if (FUNC_ON_COL.matcher(up).find() && !up.startsWith("ACCESS(")) {
                    // PR06 function applied to a column in a filter (Pro)
                    out.add(new Finding("PR06", Severity.INFO, l.id, true,
                            "Function applied to a column in a filter at " + l + ": " + shorten(p),
                            "An index on the bare column cannot be used for this predicate. Rewrite it (for example a "
                                    + "date range instead of TRUNC(col)) or create a function-based index on the expression."));
                }
                // PR07 leading wildcard (Pro)
                if (LEADING_WILDCARD.matcher(up).find()) {
                    out.add(new Finding("PR07", Severity.INFO, l.id, true,
                            "LIKE with a leading % at " + l,
                            "A B-tree index range scan cannot be used for '%text'. Consider Oracle Text (CONTAINS) or a "
                                    + "reversed-string function-based index for suffix searches."));
                }
            }
            // PR08 nested loops driven by many rows (Pro)
            if (l.is("NESTED LOOPS") && !l.children.isEmpty()) {
                long outer = effectiveRows(l.children.get(0));
                if (outer >= BIG_ROWS) {
                    out.add(new Finding("PR08", Severity.WARNING, l.id, true,
                            "Nested loops driven by about " + human(outer) + " rows at " + l,
                            "The inner side runs once per outer row. For large row sources a HASH JOIN is usually "
                                    + "cheaper; check the estimates first (often the optimizer expected few rows)."));
                }
            }
            // PR09 FILTER with a subquery executed per row (Pro)
            if (l.operation.equals("FILTER") && l.children.size() >= 2) {
                PlanLine sub = l.children.get(1);
                String runs = sub.starts > 0 ? human(sub.starts) + " times" : "once per row of the first child";
                out.add(new Finding("PR09", sub.starts >= 1000 ? Severity.WARNING : Severity.INFO, l.id, true,
                        "Subquery under FILTER at " + l + " executes " + runs,
                        "Correlated subqueries (NOT IN / EXISTS that were not unnested) run per row. Try rewriting "
                                + "as a join or NOT EXISTS, and make sure NOT IN columns are NOT NULL."));
            }
            // PR10 no partition pruning (Pro)
            if (l.operation.matches("PARTITION (RANGE|LIST|HASH|INTERVAL|COMBINED) ALL")) {
                out.add(new Finding("PR10", Severity.WARNING, l.id, true,
                        "No partition pruning at " + l,
                        "All partitions are read. Filter directly on the partition key with a value of its own type, "
                                + "without functions on the key column."));
            }
            // PR11 index skip scan / big index full scan (Pro)
            if (l.is("INDEX SKIP SCAN")) {
                out.add(new Finding("PR11", Severity.INFO, l.id, true,
                        "Index skip scan on " + l.name,
                        "The leading column of the index is not in the predicate. An index that starts with the "
                                + "filtered column is usually better."));
            } else if (l.is("INDEX FULL SCAN") && effectiveRows(l) >= 100_000) {
                out.add(new Finding("PR11", Severity.INFO, l.id, true,
                        "Index full scan of " + l.name + " over about " + human(effectiveRows(l)) + " rows",
                        "Single-block reads of the whole index. INDEX FAST FULL SCAN or a full table scan may be faster."));
            }
            // PR12 temp spill (Pro)
            if (l.tempSpace > 0) {
                out.add(new Finding("PR12", Severity.WARNING, l.id, true,
                        "Uses temporary space (" + human(l.tempSpace) + "B) at " + l,
                        "The sort or hash work area spilled to disk. Reduce the rows/columns going into it, or check "
                                + "PGA_AGGREGATE_TARGET."));
            }
            // PR14 remote access (Pro)
            if (l.operation.startsWith("REMOTE")) {
                out.add(new Finding("PR14", Severity.INFO, l.id, true,
                        "Remote access over a database link at " + l,
                        "Rows travel over the network. Push filters to the remote side (DRIVING_SITE hint) or reduce "
                                + "the columns selected."));
            }
            // PR15 big sort (Pro)
            if ((l.is("SORT ORDER BY") || l.is("SORT GROUP BY") || l.is("SORT UNIQUE")) && effectiveRows(l) >= 1_000_000) {
                out.add(new Finding("PR15", Severity.INFO, l.id, true,
                        "Large sort of about " + human(effectiveRows(l)) + " rows at " + l,
                        "Check whether the sort is needed (ORDER BY in subqueries, DISTINCT hiding duplicate joins)."));
            }
        }
        // PR13 dynamic statistics (Pro)
        for (String n : plan.notes()) {
            String low = n.toLowerCase(Locale.ROOT);
            if (low.contains("dynamic statistics used") || low.contains("dynamic sampling used")) {
                out.add(new Finding("PR13", Severity.WARNING, -1, true,
                        "Optimizer used dynamic statistics: " + n,
                        "Usually some tables have no statistics. Gather them with DBMS_STATS (temporary tables: "
                                + "consider session-private statistics)."));
            } else if (low.contains("cardinality feedback") || low.contains("statistics feedback")) {
                out.add(new Finding("PR13", Severity.INFO, -1, true,
                        "Statistics feedback was used: " + n,
                        "The first execution had wrong estimates. Fix the statistics so the plan is stable."));
            }
        }
        return out;
    }

    /** Actual rows when the plan has them, otherwise the estimate multiplied by starts. */
    static long effectiveRows(PlanLine l) {
        if (l.actualRows >= 0) return l.actualRows;
        if (l.rows < 0) return -1;
        return l.rows * Math.max(1, l.starts);
    }

    static String human(long v) {
        if (v < 10_000) return Long.toString(v);
        if (v < 10_000_000) return Math.round(v / 1000.0) + "K";
        if (v < 10_000_000_000L) return Math.round(v / 1_000_000.0) + "M";
        return Math.round(v / 1_000_000_000.0) + "G";
    }

    private static String shorten(String p) {
        return p.length() <= 120 ? p : p.substring(0, 117) + "...";
    }
}

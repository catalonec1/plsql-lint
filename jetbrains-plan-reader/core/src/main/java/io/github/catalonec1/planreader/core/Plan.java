package io.github.catalonec1.planreader.core;

import java.util.List;
import java.util.Map;

/** A parsed execution plan. */
public record Plan(String planHash, List<String> columns, List<PlanLine> lines,
                   Map<Integer, List<String>> predicates, List<String> notes) {
    public boolean hasColumn(String name) {
        return columns.contains(name);
    }

    public PlanLine line(int id) {
        for (PlanLine l : lines) if (l.id == id) return l;
        return null;
    }

    public PlanLine root() {
        return lines.isEmpty() ? null : lines.get(0);
    }

    public List<String> predicatesOf(int id) {
        return predicates.getOrDefault(id, List.of());
    }

    public boolean hasActuals() {
        return hasColumn("A-Rows");
    }
}

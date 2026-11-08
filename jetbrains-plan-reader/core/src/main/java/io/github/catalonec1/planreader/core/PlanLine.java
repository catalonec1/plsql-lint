package io.github.catalonec1.planreader.core;

import java.util.ArrayList;
import java.util.List;

/** One row of a DBMS_XPLAN plan table. Numeric fields are -1 when the column is absent or empty. */
public final class PlanLine {
    public final int id;
    public final int depth;
    public final boolean hasPredicate;
    public final String operation;
    public final String name;
    public final long rows;      // "Rows" or "E-Rows" (optimizer estimate, per start)
    public final long bytes;
    public final long cost;
    public final int cpuPercent;
    public final String time;
    public final long starts;
    public final long actualRows; // "A-Rows" (total over all starts)
    public final long buffers;
    public final long tempSpace;  // "TempSpc" or "Used-Tmp"
    PlanLine parent;
    final List<PlanLine> children = new ArrayList<>();

    PlanLine(int id, int depth, boolean hasPredicate, String operation, String name, long rows, long bytes, long cost,
             int cpuPercent, String time, long starts, long actualRows, long buffers, long tempSpace) {
        this.id = id;
        this.depth = depth;
        this.hasPredicate = hasPredicate;
        this.operation = operation;
        this.name = name;
        this.rows = rows;
        this.bytes = bytes;
        this.cost = cost;
        this.cpuPercent = cpuPercent;
        this.time = time;
        this.starts = starts;
        this.actualRows = actualRows;
        this.buffers = buffers;
        this.tempSpace = tempSpace;
    }

    public PlanLine parent() {
        return parent;
    }

    public List<PlanLine> children() {
        return List.copyOf(children);
    }

    /** Cost of this step alone: its cumulative cost minus the cumulative cost of its direct children. */
    public long selfCost() {
        if (cost < 0) return -1;
        long sum = 0;
        for (PlanLine c : children) if (c.cost > 0) sum += c.cost;
        return Math.max(0, cost - sum);
    }

    public boolean is(String op) {
        return operation.equals(op) || operation.startsWith(op + " ");
    }

    @Override
    public String toString() {
        return id + " " + operation + (name.isEmpty() ? "" : " " + name);
    }
}

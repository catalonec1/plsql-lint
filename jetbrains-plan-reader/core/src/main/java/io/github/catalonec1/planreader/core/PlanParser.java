package io.github.catalonec1.planreader.core;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses the text output of DBMS_XPLAN.DISPLAY / DISPLAY_CURSOR / DISPLAY_AWR (typical, all, allstats last),
 * as printed by SQL*Plus, SQLcl, SQL Developer, DataGrip or an application log.
 */
public final class PlanParser {
    private static final Pattern HASH = Pattern.compile("Plan hash value:\\s*(\\d+)");
    private static final Pattern ID_CELL = Pattern.compile("^\\s*(\\*?)\\s*(\\d+)\\s*$");
    private static final Pattern PRED_START = Pattern.compile("^\\s*(\\d+)\\s*-\\s*(.*)$");
    private static final Pattern NUM = Pattern.compile("^(\\d+(?:\\.\\d+)?)\\s*([KMGTPE]?)$");
    private static final Pattern COST = Pattern.compile("^(\\d+(?:\\.\\d+)?[KMGTPE]?)\\s*(?:\\((\\d+)\\))?$");

    private PlanParser() {}

    public static Plan parse(String text) {
        if (text == null) text = "";
        String[] raw = text.replace("\r", "").split("\n", -1);
        String hash = null;
        List<String> header = null;
        List<PlanLine> lines = new ArrayList<>();
        Map<Integer, List<String>> preds = new LinkedHashMap<>();
        List<String> notes = new ArrayList<>();

        String section = "plan";
        Integer predId = null;
        for (String line0 : raw) {
            String line = stripLogPrefix(line0);
            String t = line.trim();
            Matcher hm = HASH.matcher(line);
            if (hm.find()) hash = hm.group(1);

            if (t.startsWith("Predicate Information")) { section = "pred"; predId = null; continue; }
            if (t.equals("Note")) { section = "note"; continue; }
            if (t.startsWith("Column Projection Information") || t.startsWith("Query Block Name")
                    || t.startsWith("Hint Report") || t.startsWith("Outline Data") || t.startsWith("Remote SQL Information")) {
                section = "other";
                continue;
            }
            if (t.startsWith("|") && section.equals("plan")) {
                List<String> cells = cells(line);
                if (header == null && cells.stream().anyMatch(c -> c.trim().equals("Operation"))) {
                    header = new ArrayList<>();
                    for (String c : cells) header.add(c.trim());
                    continue;
                }
                if (header != null && !cells.isEmpty()) {
                    Matcher im = ID_CELL.matcher(cells.get(0));
                    if (im.matches()) lines.add(row(header, cells, !im.group(1).isEmpty(), Integer.parseInt(im.group(2))));
                }
                continue;
            }
            if (section.equals("pred")) {
                if (t.isEmpty() || t.matches("-+")) continue;
                Matcher pm = PRED_START.matcher(line);
                if (pm.matches()) {
                    predId = Integer.parseInt(pm.group(1));
                    preds.computeIfAbsent(predId, k -> new ArrayList<>()).add(pm.group(2).trim());
                } else if (predId != null) {
                    List<String> l = preds.get(predId);
                    if (t.startsWith("access(") || t.startsWith("filter(") || t.startsWith("storage(")) l.add(t);
                    else l.set(l.size() - 1, l.get(l.size() - 1) + " " + t);
                }
            } else if (section.equals("note")) {
                if (t.startsWith("-") && !t.matches("-+")) notes.add(t.substring(1).trim());
            }
        }
        linkTree(lines);
        return new Plan(hash, header == null ? List.of() : List.copyOf(header), List.copyOf(lines), preds, List.copyOf(notes));
    }

    /** Removes prefixes such as "2026-11-08 10:00:01 DEBUG " or "SQL> " that loggers and consoles add. */
    static String stripLogPrefix(String line) {
        int bar = line.indexOf('|');
        if (bar > 0) {
            String before = line.substring(0, bar);
            String rest = line.substring(bar);
            boolean tableRow = rest.matches("^\\|[ *]*\\d+ *\\|.*") || rest.contains("| Operation");
            if (!before.isBlank() && tableRow) return rest;
        }
        return line;
    }

    private static List<String> cells(String line) {
        String s = line.trim();
        if (s.startsWith("|")) s = s.substring(1);
        if (s.endsWith("|")) s = s.substring(0, s.length() - 1);
        List<String> out = new ArrayList<>();
        for (String c : s.split("\\|", -1)) out.add(c);
        return out;
    }

    private static PlanLine row(List<String> header, List<String> cells, boolean star, int id) {
        String op = "";
        int depth = 0;
        String name = "";
        long rows = -1, bytes = -1, cost = -1, starts = -1, aRows = -1, buffers = -1, temp = -1;
        int cpu = -1;
        String time = "";
        for (int i = 0; i < header.size() && i < cells.size(); i++) {
            String h = header.get(i);
            String c = cells.get(i);
            switch (h) {
                case "Operation" -> {
                    int lead = 0;
                    while (lead < c.length() && c.charAt(lead) == ' ') lead++;
                    depth = Math.max(0, lead - 1);
                    op = c.trim().replaceAll("\\s+", " ");
                }
                case "Name" -> name = c.trim();
                case "Rows", "E-Rows" -> rows = number(c);
                case "Bytes" -> bytes = number(c);
                case "Cost (%CPU)", "Cost" -> {
                    Matcher m = COST.matcher(c.trim());
                    if (m.matches()) {
                        cost = number(m.group(1));
                        if (m.group(2) != null) cpu = Integer.parseInt(m.group(2));
                    }
                }
                case "Time", "A-Time" -> { if (time.isEmpty()) time = c.trim(); }
                case "Starts" -> starts = number(c);
                case "A-Rows" -> aRows = number(c);
                case "Buffers" -> buffers = number(c);
                case "TempSpc", "Used-Tmp" -> { long v = number(c); if (v > temp) temp = v; }
                default -> { }
            }
        }
        return new PlanLine(id, depth, star, op, name, rows, bytes, cost, cpu, time, starts, aRows, buffers, temp);
    }

    /** Parses "123", "10K", "1.5M"... ; -1 if empty or not a number. */
    static long number(String s) {
        if (s == null) return -1;
        Matcher m = NUM.matcher(s.trim().toUpperCase(Locale.ROOT));
        if (!m.matches()) return -1;
        double v = Double.parseDouble(m.group(1));
        int pow = switch (m.group(2)) {
            case "K" -> 1; case "M" -> 2; case "G" -> 3; case "T" -> 4; case "P" -> 5; case "E" -> 6; default -> 0;
        };
        return Math.round(v * Math.pow(1000, pow));
    }

    private static void linkTree(List<PlanLine> lines) {
        Deque<PlanLine> stack = new ArrayDeque<>();
        for (PlanLine l : lines) {
            while (!stack.isEmpty() && stack.peek().depth >= l.depth) stack.pop();
            if (!stack.isEmpty()) {
                l.parent = stack.peek();
                stack.peek().children.add(l);
            }
            stack.push(l);
        }
    }
}

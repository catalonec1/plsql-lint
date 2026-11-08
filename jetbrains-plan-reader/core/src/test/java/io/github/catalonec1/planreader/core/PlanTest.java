package io.github.catalonec1.planreader.core;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class PlanTest {
    static final String TYPICAL = """
            Plan hash value: 3254851382

            ---------------------------------------------------------------------------------------------
            | Id  | Operation                    | Name         | Rows  | Bytes |TempSpc| Cost (%CPU)| Time     |
            ---------------------------------------------------------------------------------------------
            |   0 | SELECT STATEMENT             |              |  1500K|    80M|       | 21000   (2)| 00:00:01 |
            |*  1 |  HASH JOIN                   |              |  1500K|    80M|    45M| 21000   (2)| 00:00:01 |
            |   2 |   MERGE JOIN CARTESIAN       |              |    40 |   800 |       |     6   (0)| 00:00:01 |
            |   3 |    TABLE ACCESS FULL         | DEPT         |     4 |    40 |       |     3   (0)| 00:00:01 |
            |   4 |    BUFFER SORT               |              |    10 |   100 |       |     3   (0)| 00:00:01 |
            |   5 |     TABLE ACCESS FULL        | REGIONS      |    10 |   100 |       |     1   (0)| 00:00:01 |
            |*  6 |   TABLE ACCESS FULL          | ORDERS       |  1500K|    50M|       | 20000   (2)| 00:00:01 |
            ---------------------------------------------------------------------------------------------

            Predicate Information (identified by operation id):
            ---------------------------------------------------

               1 - access("O"."DEPT_ID"="D"."DEPT_ID")
               6 - filter(TO_NUMBER("O"."CUST_CODE")=42 AND
                          UPPER("O"."STATUS")='OPEN')

            Note
            -----
               - dynamic statistics used: dynamic sampling (level=2)
            """;

    static final String ALLSTATS = """
            SQL_ID  9babjv8yq8ru3, child number 0
            -------------------------------------
            Plan hash value: 1234

            -------------------------------------------------------------------------------------------------
            | Id  | Operation                     | Name    | Starts | E-Rows | A-Rows |   A-Time   | Buffers |
            -------------------------------------------------------------------------------------------------
            |   0 | SELECT STATEMENT              |         |      1 |        |  50000 |00:00:02.10 |   90000 |
            |   1 |  NESTED LOOPS                 |         |      1 |     10 |  50000 |00:00:02.10 |   90000 |
            |*  2 |   TABLE ACCESS FULL           | ORDERS  |      1 |     10 |  50000 |00:00:00.50 |    1000 |
            |   3 |   TABLE ACCESS BY INDEX ROWID | CUST    |  50000 |      1 |  50000 |00:00:01.50 |   89000 |
            |*  4 |    INDEX UNIQUE SCAN          | CUST_PK |  50000 |      1 |  50000 |00:00:00.80 |   50000 |
            |   5 |  PARTITION RANGE ALL          |         |      1 |      1 |      1 |00:00:00.01 |       3 |
            -------------------------------------------------------------------------------------------------

            Predicate Information (identified by operation id):
            ---------------------------------------------------

               2 - filter("O"."NOTE" LIKE '%urgent%')
               4 - access("C"."ID"="O"."CUST_ID")
            """;

    private static Set<String> rules(List<Finding> fs) {
        return fs.stream().map(Finding::rule).collect(Collectors.toSet());
    }

    @Test
    void parsesTypicalPlan() {
        Plan p = PlanParser.parse(TYPICAL);
        assertEquals("3254851382", p.planHash());
        assertEquals(7, p.lines().size());
        PlanLine six = p.line(6);
        assertEquals("TABLE ACCESS FULL", six.operation);
        assertEquals("ORDERS", six.name);
        assertEquals(1_500_000, six.rows);
        assertEquals(20000, six.cost);
        assertEquals(2, six.cpuPercent);
        assertTrue(six.hasPredicate);
        assertEquals(1, six.parent().id);
        assertEquals(2, six.depth);
        assertEquals(List.of(2, 6), p.line(1).children().stream().map(l -> l.id).toList());
        assertEquals(45_000_000, p.line(1).tempSpace);
        assertEquals(1, p.predicatesOf(6).size()); // continuation line joined into the same predicate
        assertTrue(p.predicatesOf(6).get(0).contains("UPPER(\"O\".\"STATUS\")"));
        assertEquals(1, p.notes().size());
        assertEquals(20000 - 0, p.line(6).selfCost());
        assertEquals(21000 - 6 - 20000, p.line(1).selfCost());
    }

    @Test
    void typicalFindings() {
        List<Finding> fs = PlanAnalyzer.analyze(PlanParser.parse(TYPICAL));
        Set<String> r = rules(fs);
        assertTrue(r.containsAll(Set.of("PR01", "PR02", "PR03", "PR05", "PR12", "PR13")), r.toString());
        Finding hot = fs.stream().filter(f -> f.rule().equals("PR01")).findFirst().orElseThrow();
        assertEquals(6, hot.lineId());
        // small full scans of DEPT/REGIONS are not reported
        assertEquals(1, fs.stream().filter(f -> f.rule().equals("PR02")).count());
    }

    @Test
    void allstatsFindings() {
        Plan p = PlanParser.parse(ALLSTATS);
        assertTrue(p.hasActuals());
        assertEquals(50000, p.line(3).starts);
        Set<String> r = rules(PlanAnalyzer.analyze(p));
        assertTrue(r.containsAll(Set.of("PR04", "PR07", "PR08", "PR10", "PR02")), r.toString());
    }

    @Test
    void freeReportHidesProFindings() {
        Plan p = PlanParser.parse(TYPICAL);
        List<Finding> fs = PlanAnalyzer.analyze(p);
        String free = Report.html(p, fs, false);
        String pro = Report.html(p, fs, true);
        assertTrue(free.contains("more finding(s)"));
        assertFalse(free.contains("Data type conversion"));
        assertTrue(pro.contains("Data type conversion"));
        assertFalse(pro.contains("pro:register"));
        assertTrue(free.contains("Cartesian product"));
    }

    @Test
    void toleratesLogPrefixesAndGarbage() {
        String logged = TYPICAL.lines().map(l -> l.startsWith("|") ? "2026-11-08 10:00:01 DEBUG " + l : l)
                .collect(Collectors.joining("\n"));
        assertEquals(7, PlanParser.parse(logged).lines().size());
        assertTrue(PlanParser.parse("hello world").lines().isEmpty());
        assertTrue(Report.html(PlanParser.parse(""), List.of(), false).contains("No plan table found"));
        assertTrue(PlanAnalyzer.analyze(PlanParser.parse(null)).isEmpty());
    }

    @Test
    void numbers() {
        assertEquals(1500, PlanParser.number("1500"));
        assertEquals(1_500_000, PlanParser.number("1500K"));
        assertEquals(2_000_000_000L, PlanParser.number("2G"));
        assertEquals(-1, PlanParser.number(""));
        assertEquals(-1, PlanParser.number("abc"));
    }
}

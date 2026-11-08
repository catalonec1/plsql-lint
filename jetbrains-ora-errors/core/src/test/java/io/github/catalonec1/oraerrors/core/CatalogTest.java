package io.github.catalonec1.oraerrors.core;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class CatalogTest {
    private final OraCatalog cat = OraCatalog.get();

    @Test
    void catalogueLoadsAndIsWellFormed() {
        assertTrue(cat.size() >= 250, "size " + cat.size());
        assertTrue(cat.freeCount() >= 40 && cat.freeCount() <= 50, "free " + cat.freeCount());
        Set<String> seen = new HashSet<>();
        for (OraError e : cat.all()) {
            assertTrue(e.code().matches("(ORA|PLS)-\\d{5}"), e.code());
            assertTrue(seen.add(e.code()), "duplicate " + e.code());
            assertFalse(e.title().isBlank(), e.code());
            assertTrue(e.cause().length() > 15, e.code());
            assertTrue(e.fix().length() > 10, e.code());
        }
    }

    @Test
    void commonErrorsAreFree() {
        for (String c : List.of("ORA-00001", "ORA-00942", "ORA-01403", "ORA-01422", "ORA-06502", "ORA-04091", "ORA-01722")) {
            assertTrue(cat.find(c).free(), c);
        }
        assertFalse(cat.find("PLS-00306").free());
    }

    @Test
    void lookupAliases() {
        assertEquals("ORA-20000", cat.find("ORA-20123").code());
        assertEquals("ORA-12541", cat.find("TNS-12541").code());
        assertNull(cat.find("ORA-99999"));
        assertNull(cat.find("ORA-21000"));
    }

    @Test
    void searchRanksCodeThenTitle() {
        assertEquals("ORA-01403", cat.search("1403").get(0).code());
        assertEquals("ORA-01403", cat.search("ora 1403").get(0).code());
        assertEquals("ORA-04091", cat.search("mutating").get(0).code());
        assertEquals(cat.size(), cat.search("  ").size());
        assertFalse(cat.search("deadlock").isEmpty());
    }

    @Test
    void htmlEscapesAndLocks() {
        OraError e = new OraError("ORA-00001", false, "a<b", "c&d", "e>f");
        String open = Html.entry(e, false);
        assertTrue(open.contains("a&lt;b") && open.contains("c&amp;d") && open.contains("e&gt;f"));
        String locked = Html.entry(e, true);
        assertFalse(locked.contains("c&amp;d"));
        assertTrue(locked.contains("Pro entry"));
    }
}

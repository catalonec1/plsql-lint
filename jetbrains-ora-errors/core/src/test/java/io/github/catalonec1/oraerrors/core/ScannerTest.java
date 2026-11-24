package io.github.catalonec1.oraerrors.core;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ScannerTest {
    @Test
    void findsCodesInAStackTrace() {
        String trace = """
            java.sql.SQLIntegrityConstraintViolationException: ORA-00001: unique constraint (APP.PK_EMP) violated
            ORA-06512: at "APP.EMP_API", line 42
            ORA-06512: at line 1
            PLS-00103: Encountered the symbol "END"
            TNS-12541: no listener
            """;
        assertEquals(List.of("ORA-00001", "ORA-06512", "PLS-00103", "TNS-12541"), OraScanner.distinctCodes(trace));
        assertEquals(5, OraScanner.scan(trace).size());
    }

    @Test
    void normalisesShortForms() {
        assertEquals(List.of("ORA-01403", "PLS-00201"), OraScanner.distinctCodes("ora-1403 then pls 201"));
        assertEquals("ORA-01403", OraScanner.normalizeLoose("1403"));
        assertEquals("PLS-00103", OraScanner.normalizeLoose("PLS-103"));
        assertNull(OraScanner.normalizeLoose("hello"));
    }

    @Test
    void ignoresLookalikes() {
        assertTrue(OraScanner.distinctCodes("CORA-1234 and STORA-5 and ORA-").isEmpty());
    }

    @Test
    void codeAtCaret() {
        String s = "x ORA-00942: table or view does not exist";
        assertEquals("ORA-00942", OraScanner.codeAt(s, 4));
        assertEquals("ORA-00942", OraScanner.codeAt(s, 11));
        assertNull(OraScanner.codeAt(s, 30));
    }
}

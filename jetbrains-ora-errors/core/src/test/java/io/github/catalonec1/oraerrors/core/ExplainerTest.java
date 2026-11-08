package io.github.catalonec1.oraerrors.core;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ExplainerTest {
    private static final String TRACE = "ORA-01422: exact fetch returns more than requested number of rows\n"
            + "ORA-06512: at \"APP.PKG\", line 10\nPLS-00306: wrong number\nORA-99999: made up";

    @Test
    void proExplainsEverything() {
        String h = Explainer.explain(TRACE, true);
        assertTrue(h.contains("ORA-01422 &ndash;"));
        assertTrue(h.contains("ORA-06512 &ndash;"));
        assertTrue(h.contains("PLS-00306 &ndash;"));
        assertFalse(h.contains("Pro entry"));
        assertTrue(h.contains("Not in the catalogue: ORA-99999"));
    }

    @Test
    void freeExplainsFirstAndListsTheRest() {
        String h = Explainer.explain(TRACE, false);
        assertTrue(h.contains("ORA-01422 &ndash;"));
        assertFalse(h.contains("ORA-06512 &ndash;"));
        assertTrue(h.contains("Also in this text:</b> ORA-06512, PLS-00306"));
    }

    @Test
    void freeSingleProCodeIsLocked() {
        String h = Explainer.explain("PLS-00306", false);
        assertTrue(h.contains("Pro entry"));
        assertTrue(h.contains("pro:register"));
    }

    @Test
    void freeSingleFreeCodeIsOpen() {
        String h = Explainer.explain("got ora-1403 again", false);
        assertTrue(h.contains("<b>Cause.</b>"));
    }

    @Test
    void nothingFound() {
        assertTrue(Explainer.explain("all good", false).contains("No ORA-"));
    }
}

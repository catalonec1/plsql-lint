package io.github.catalonec1.oraerrors.core;

/** One catalogue entry. {@code free} entries are available without a licence. */
public record OraError(String code, boolean free, String title, String cause, String fix) {
    /** Number part as int, e.g. 1403 for ORA-01403. */
    public int number() {
        return Integer.parseInt(code.substring(code.indexOf('-') + 1));
    }

    public String prefix() {
        return code.substring(0, code.indexOf('-'));
    }
}

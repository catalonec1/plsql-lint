package io.github.catalonec1.plsqllint.core;

/**
 * One problem found in the source.
 *
 * @param offset 0-based start offset of the highlighted range
 * @param length length of the highlighted range (at least 1 unless the file is empty)
 * @param fix    optional automatic replacement, or {@code null}
 */
public record Finding(String code, String message, Severity severity,
                      int line, int col, int offset, int length, Fix fix) {

    public enum Severity { ERROR, WARNING, INFO }

    /** Replace {@code [offset, offset + length)} with {@code replacement}. */
    public record Fix(String name, int offset, int length, String replacement) {
        public String apply(String source) {
            return source.substring(0, offset) + replacement + source.substring(offset + length);
        }
    }

    @Override
    public String toString() {
        return line + ":" + col + " " + code + " [" + severity.name().toLowerCase(java.util.Locale.ROOT) + "] " + message;
    }
}

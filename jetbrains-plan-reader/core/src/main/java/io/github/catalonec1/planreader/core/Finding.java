package io.github.catalonec1.planreader.core;

/** One observation about a plan. {@code lineId} is -1 for plan-wide findings (notes). */
public record Finding(String rule, Severity severity, int lineId, boolean pro, String title, String advice) {
    public enum Severity { ERROR, WARNING, INFO }
}

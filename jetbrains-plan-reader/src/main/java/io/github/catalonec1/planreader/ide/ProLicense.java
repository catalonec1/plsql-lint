package io.github.catalonec1.planreader.ide;

/** Cached licence state: signature checks are too expensive for every highlighting pass. */
public final class ProLicense {
    private static final long TTL_MS = 5 * 60 * 1000L;
    private static volatile boolean cached;
    private static volatile long checkedAt;

    private ProLicense() {}

    public static boolean isPro() {
        long now = System.currentTimeMillis();
        if (checkedAt != 0 && now - checkedAt < TTL_MS) return cached;
        Boolean licensed = CheckLicense.isLicensed();
        if (licensed == null) return false; // licensing not initialised yet: ask again next time
        cached = licensed;
        checkedAt = now;
        return licensed;
    }

    /** Forget the cached state, e.g. right after the user registered. */
    public static void reset() {
        checkedAt = 0;
    }
}

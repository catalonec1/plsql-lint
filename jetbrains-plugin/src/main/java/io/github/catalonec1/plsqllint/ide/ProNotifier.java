package io.github.catalonec1.plsqllint.ide;

import com.intellij.notification.Notification;
import com.intellij.notification.NotificationAction;
import com.intellij.notification.NotificationGroupManager;
import com.intellij.notification.NotificationType;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Key;

/** Tells an unlicensed user, once per project and IDE session, that Pro checks found something. */
final class ProNotifier {
    private static final Key<Boolean> SHOWN = Key.create("plsql.lint.pro.notified");

    private ProNotifier() {}

    static void proIssuesHidden(Project project, String code, int count) {
        if (project.isDisposed() || Boolean.TRUE.equals(project.getUserData(SHOWN))) return;
        project.putUserData(SHOWN, Boolean.TRUE);
        Notification n = NotificationGroupManager.getInstance().getNotificationGroup("PL/SQL Lint Pro")
                .createNotification("PL/SQL Lint Pro",
                        "Pro checks found " + count + " issue(s) (" + code + " and others) that are hidden in the free version: "
                                + "row-by-row DML, autonomous transactions without COMMIT, UPDATE/DELETE without WHERE, "
                                + "hard-coded passwords. Quick fixes are Pro too.",
                        NotificationType.INFORMATION);
        n.addAction(NotificationAction.createSimpleExpiring("Start free trial / register", () -> {
            ProLicense.reset();
            CheckLicense.requestLicense("Unlock the Pro checks and quick fixes of PL/SQL Lint");
        }));
        n.notify(project);
    }
}

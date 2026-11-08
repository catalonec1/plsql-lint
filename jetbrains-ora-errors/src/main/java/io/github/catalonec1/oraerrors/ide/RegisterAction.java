package io.github.catalonec1.oraerrors.ide;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.project.DumbAwareAction;
import org.jetbrains.annotations.NotNull;

/** Tools | ORA Error Helper Pro: Register or Start Trial. */
public final class RegisterAction extends DumbAwareAction {
    static final String MESSAGE = "Unlock all 250+ Oracle error explanations and whole stack-trace explanations";

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        register();
    }

    static void register() {
        ProLicense.reset();
        CheckLicense.requestLicense(MESSAGE);
    }

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }
}

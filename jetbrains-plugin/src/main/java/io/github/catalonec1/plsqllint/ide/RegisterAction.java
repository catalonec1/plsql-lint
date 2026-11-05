package io.github.catalonec1.plsqllint.ide;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.project.DumbAwareAction;
import org.jetbrains.annotations.NotNull;

/** Tools | PL/SQL Lint Pro: Register or Start Trial. */
public final class RegisterAction extends DumbAwareAction {
    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        ProLicense.reset();
        CheckLicense.requestLicense("Unlock the Pro checks and quick fixes of PL/SQL Lint");
    }

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }
}

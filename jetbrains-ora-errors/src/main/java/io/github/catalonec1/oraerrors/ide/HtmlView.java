package io.github.catalonec1.oraerrors.ide;

import com.intellij.ui.components.JBScrollPane;
import com.intellij.util.ui.HTMLEditorKitBuilder;
import com.intellij.util.ui.JBUI;

import javax.swing.JEditorPane;
import javax.swing.event.HyperlinkEvent;

/** Read-only HTML pane that follows the IDE theme and handles the "pro:register" link. */
final class HtmlView {
    private HtmlView() {}

    static JEditorPane create(String html) {
        JEditorPane pane = new JEditorPane();
        pane.setEditorKit(HTMLEditorKitBuilder.simple());
        pane.setEditable(false);
        pane.setBorder(JBUI.Borders.empty(6));
        pane.setText(html);
        pane.setCaretPosition(0);
        pane.addHyperlinkListener(e -> {
            if (e.getEventType() == HyperlinkEvent.EventType.ACTIVATED && "pro:register".equals(e.getDescription())) {
                RegisterAction.register();
            }
        });
        return pane;
    }

    static JBScrollPane scroll(JEditorPane pane) {
        JBScrollPane sp = new JBScrollPane(pane);
        sp.setBorder(JBUI.Borders.empty());
        return sp;
    }
}

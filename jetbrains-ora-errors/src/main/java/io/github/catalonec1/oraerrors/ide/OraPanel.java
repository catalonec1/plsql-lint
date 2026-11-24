package io.github.catalonec1.oraerrors.ide;

import com.intellij.openapi.ui.Splitter;
import com.intellij.ui.CollectionListModel;
import com.intellij.ui.ColoredListCellRenderer;
import com.intellij.ui.DocumentAdapter;
import com.intellij.ui.SearchTextField;
import com.intellij.ui.SimpleTextAttributes;
import com.intellij.ui.components.JBList;
import com.intellij.ui.components.JBScrollPane;
import io.github.catalonec1.oraerrors.core.Html;
import io.github.catalonec1.oraerrors.core.OraCatalog;
import io.github.catalonec1.oraerrors.core.OraError;
import org.jetbrains.annotations.NotNull;

import javax.swing.JEditorPane;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.ListSelectionModel;
import javax.swing.event.DocumentEvent;
import java.awt.BorderLayout;

/** Tool window content: search box, list of errors, explanation pane. */
final class OraPanel extends JPanel {
    private final SearchTextField search = new SearchTextField(false);
    private final CollectionListModel<OraError> model = new CollectionListModel<>();
    private final JBList<OraError> list = new JBList<>(model);
    private final JEditorPane detail = HtmlView.create(intro());

    OraPanel() {
        super(new BorderLayout());
        list.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        list.setCellRenderer(new ColoredListCellRenderer<>() {
            @Override
            protected void customizeCellRenderer(@NotNull JList<? extends OraError> l, OraError e, int index,
                                                 boolean selected, boolean hasFocus) {
                append(e.code(), SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES);
                append("  " + e.title());
                if (!e.free() && !ProLicense.isPro()) append("  Pro", SimpleTextAttributes.GRAYED_ATTRIBUTES);
            }
        });
        list.addListSelectionListener(ev -> {
            if (ev.getValueIsAdjusting()) return;
            OraError e = list.getSelectedValue();
            if (e != null) setHtml("<html><body>" + Html.entry(e, !e.free() && !ProLicense.isPro()) + "</body></html>");
        });
        search.addDocumentListener(new DocumentAdapter() {
            @Override
            protected void textChanged(@NotNull DocumentEvent e) {
                refill();
            }
        });
        Splitter split = new Splitter(true, 0.45f);
        split.setFirstComponent(new JBScrollPane(list));
        split.setSecondComponent(HtmlView.scroll(detail));
        add(search, BorderLayout.NORTH);
        add(split, BorderLayout.CENTER);
        refill();
    }

    private void refill() {
        model.replaceAll(OraCatalog.get().search(search.getText()));
        if (model.getSize() == 1) list.setSelectedIndex(0);
    }

    /** Shows one error (selects it in the list) or arbitrary HTML (stack explanation). */
    void show(String code) {
        search.setText(code);
        refill();
        if (model.getSize() > 0) list.setSelectedIndex(0);
    }

    void setHtml(String html) {
        detail.setText(html);
        detail.setCaretPosition(0);
    }

    private static String intro() {
        OraCatalog c = OraCatalog.get();
        return "<html><body><p>Type an error code (1403, ORA-00942, PLS-306) or a word (mutating, deadlock).</p>"
                + "<p>Select text with errors in any editor or console and use <b>Explain Oracle Error</b> from the "
                + "context menu.</p><p>" + c.size() + " errors in the catalogue, " + c.freeCount()
                + " of the most common ones are free.</p></body></html>";
    }
}

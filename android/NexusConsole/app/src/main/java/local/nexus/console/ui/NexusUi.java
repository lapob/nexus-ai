package local.nexus.console.ui;

import local.nexus.console.R;
import local.nexus.motion.NexusColors;
import local.nexus.motion.NexusMotion;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.StateListAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Kit visivo di Control: token colore, tipografia Inter, superfici di vetro
 * con filo di luce, pulsanti con stati contenuti nella forma, righe e
 * separatori. Ogni schermata costruisce le proprie viste solo da qui, così il
 * linguaggio resta unico anche con i file separati.
 */
public final class NexusUi {
    public static final int BG = NexusColors.INK;
    public static final int SURFACE = NexusColors.SURFACE;
    public static final int TEXT = NexusColors.ICE;
    public static final int MUTED = NexusColors.MIST;
    public static final int ACCENT = NexusColors.CYAN;
    public static final int DANGER = Color.rgb(255, 154, 145);
    public static final int DANGER_TEXT = Color.rgb(244, 193, 178);
    public static final int RIPPLE = Color.argb(42, 109, 224, 221);

    private final Context context;
    private final Motion motion;
    private final Typeface inter;

    public NexusUi(Context context, Motion motion) {
        this.context = context;
        this.motion = motion;
        this.inter = context.getResources().getFont(R.font.inter_variable);
    }

    public Context context() { return context; }
    public Motion motion() { return motion; }

    public int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }

    public TextView text(String value, int sp, int color) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(inter);
        return view;
    }

    public TextView bold(TextView view) {
        view.setTypeface(inter, Typeface.BOLD);
        return view;
    }

    public TextView eyebrow(String value) {
        TextView view = text(value, 12, Color.rgb(171, 186, 187));
        view.setLetterSpacing(.08f);
        return view;
    }

    /** Chip in maiuscoletto: stato del varco, delle conferme e degli esiti. */
    public TextView chip(String value, int color, int fill, int stroke) {
        TextView chip = bold(text(value, 11, color));
        chip.setLetterSpacing(.22f);
        chip.setPadding(dp(12), dp(6), dp(12), dp(6));
        chip.setBackground(rounded(fill, 99, stroke));
        return chip;
    }

    public Button button(String label, boolean primary, boolean danger) {
        Button button = new NexusButton(context);
        button.setText(label);
        button.setTextSize(15);
        button.setTypeface(inter);
        button.setIncludeFontPadding(false);
        button.setLetterSpacing(.005f);
        button.setTextColor(danger ? DANGER_TEXT : primary ? Color.rgb(211, 242, 241) : Color.rgb(153, 188, 189));
        button.setTransformationMethod(null);
        button.setAllCaps(false);
        button.setStateListAnimator(null);
        int fill = danger ? Color.rgb(33, 15, 13) : primary ? Color.rgb(7, 35, 36) : Color.rgb(5, 17, 18);
        int stroke = danger ? Color.argb(70, 232, 153, 132) : primary ? Color.argb(60, 101, 221, 218) : Color.argb(26, 132, 190, 192);
        // Stati contenuti nella forma del pulsante: il focus (tastiera, lettore
        // di schermo, telecomando) accende il bordo; la pressione resta un'onda
        // ritagliata sulla stessa forma, mai un riquadro nativo che deborda.
        StateListDrawable surface = new StateListDrawable();
        int focusStroke = danger ? Color.argb(170, 244, 170, 150) : Color.argb(170, 120, 236, 233);
        GradientDrawable focused = rounded(lighten(fill, 6), 19, focusStroke);
        focused.setStroke(dp(2), focusStroke);
        surface.addState(new int[] { android.R.attr.state_focused }, focused);
        surface.addState(new int[] {}, withEdgeLight(rounded(fill, 19, stroke), 19, primary || danger));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(danger ? Color.argb(45, 240, 145, 119) : RIPPLE), surface, null));
        StateListAnimator feedback = new StateListAnimator();
        ObjectAnimator pressed = ObjectAnimator.ofPropertyValuesHolder(button, PropertyValuesHolder.ofFloat(View.SCALE_X, .97f), PropertyValuesHolder.ofFloat(View.SCALE_Y, .97f));
        pressed.setDuration(motion.duration(NexusMotion.PRESS));
        ObjectAnimator released = ObjectAnimator.ofPropertyValuesHolder(button, PropertyValuesHolder.ofFloat(View.SCALE_X, 1f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f));
        released.setDuration(motion.duration(NexusMotion.RELEASE));
        feedback.addState(new int[] { android.R.attr.state_pressed }, pressed);
        feedback.addState(new int[] {}, released);
        if (ValueAnimator.areAnimatorsEnabled()) button.setStateListAnimator(feedback);
        return button;
    }

    public void decorateButton(Button button, String glyph, int color) {
        Drawable icon = new NexusGlyphDrawable(motion, glyph, color, dp(22));
        button.setCompoundDrawables(icon, null, null, null);
        button.setCompoundDrawablePadding(dp(9));
        button.setGravity(Gravity.CENTER);
    }

    /** Pulsante con icona: forma la base di ogni azione esplicita. */
    public Button action(String label, String glyph, int iconColor, boolean primary, boolean danger) {
        Button button = button(label, primary, danger);
        decorateButton(button, glyph, iconColor);
        return button;
    }

    public Drawable ripple(Drawable surface) {
        return new RippleDrawable(ColorStateList.valueOf(RIPPLE), surface, null);
    }

    public LinearLayout card() {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(17), dp(13), dp(17), dp(13));
        card.setBackground(withEdgeLight(rounded(SURFACE, 22, Color.argb(30, 75, 231, 233)), 22, false));
        return card;
    }

    /**
     * Filo di luce sul bordo superiore delle superfici: un gradiente orizzontale
     * che svanisce verso gli angoli, come la luce del nucleo su vetro scuro.
     */
    public Drawable withEdgeLight(GradientDrawable base, int radius, boolean strong) {
        GradientDrawable edge = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[] { Color.TRANSPARENT, Color.argb(strong ? 120 : 64, 120, 236, 233), Color.TRANSPARENT });
        LayerDrawable layers = new LayerDrawable(new Drawable[] { base, edge });
        layers.setLayerHeight(1, Math.max(1, dp(1)));
        layers.setLayerGravity(1, Gravity.TOP | Gravity.FILL_HORIZONTAL);
        layers.setLayerInsetLeft(1, dp(radius));
        layers.setLayerInsetRight(1, dp(radius));
        return layers;
    }

    /**
     * Superficie "vetro" condivisa con la web app: luce dall'alto (gradiente
     * verticale appena più chiaro in cima) e bordo sottile. Stessi token ovunque.
     */
    public GradientDrawable rounded(int fill, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{ lighten(fill, 10), fill, fill });
        shape.setCornerRadius(dp(radius));
        if (stroke != Color.TRANSPARENT) shape.setStroke(dp(1), stroke);
        return shape;
    }

    public static int lighten(int color, int amount) {
        return Color.argb(Color.alpha(color), Math.min(255, Color.red(color) + amount),
            Math.min(255, Color.green(color) + amount + 2), Math.min(255, Color.blue(color) + amount + 2));
    }

    /** Fondale cosmico: alone ciano dall'alto che sfuma nell'inchiostro, come il corpo della web app. */
    public GradientDrawable cosmicBackground() {
        GradientDrawable sky = new GradientDrawable();
        sky.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        sky.setGradientCenter(.5f, 0f);
        sky.setGradientRadius(Math.max(context.getResources().getDisplayMetrics().widthPixels, context.getResources().getDisplayMetrics().heightPixels) * .85f);
        sky.setColors(new int[]{ Color.rgb(13, 36, 38), Color.rgb(6, 16, 18), BG });
        return sky;
    }

    /** Alone ciano per gli elementi attivi (Android 9+): l'ombra prende il colore dell'accento. */
    public void glow(View view, boolean active) {
        view.setElevation(active ? dp(10) : 0);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            view.setOutlineAmbientShadowColor(active ? ACCENT : Color.BLACK);
            view.setOutlineSpotShadowColor(active ? ACCENT : Color.BLACK);
        }
    }

    public View divider() {
        View line = new View(context);
        // Separatore che sfuma ai lati invece di una riga piena.
        line.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[] { Color.TRANSPARENT, Color.argb(40, 132, 190, 192), Color.TRANSPARENT }));
        line.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(1)));
        return line;
    }

    /** Barra di avanzamento a fascio luminoso che si riempie all'ingresso. */
    public LinearLayout progress(int percent) {
        LinearLayout track = new LinearLayout(context);
        track.setBackground(rounded(Color.rgb(9, 29, 30), 999, Color.TRANSPARENT));
        LinearLayout fill = new LinearLayout(context);
        GradientDrawable beam = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[] { Color.argb(150, 75, 231, 233), ACCENT, Color.rgb(214, 250, 249) });
        beam.setCornerRadius(dp(999));
        fill.setBackground(beam);
        track.addView(fill, new LinearLayout.LayoutParams(0, dp(3)));
        LinearLayout holder = new LinearLayout(context);
        holder.setPadding(0, 0, 0, dp(8));
        holder.addView(track, new LinearLayout.LayoutParams(-1, dp(3)));
        track.post(() -> {
            int width = Math.max(dp(18), Math.round(track.getWidth() * Math.max(0, Math.min(100, percent)) / 100f));
            LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) fill.getLayoutParams();
            params.width = motion.enabled() ? 0 : width;
            params.height = dp(3);
            fill.setLayoutParams(params);
            if (!motion.enabled()) return;
            ValueAnimator reveal = ValueAnimator.ofInt(0, width);
            reveal.setDuration(motion.duration(NexusMotion.CURSOR_PULSE));
            reveal.setInterpolator(motion.standard());
            reveal.addUpdateListener(animation -> {
                LinearLayout.LayoutParams animated = (LinearLayout.LayoutParams) fill.getLayoutParams();
                animated.width = (int) animation.getAnimatedValue();
                fill.setLayoutParams(animated);
            });
            reveal.start();
        });
        return holder;
    }

    /** Riga etichetta/valore; il valore è raggiungibile col tag "value:" + etichetta. */
    public LinearLayout infoRow(String label, String value) {
        LinearLayout row = new LinearLayout(context);
        row.setPadding(0, dp(7), 0, dp(7));
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView name = text(label, 13, MUTED);
        TextView statusValue = text(value, 13, TEXT);
        statusValue.setTag("value:" + label);
        if (context.getResources().getConfiguration().fontScale >= 1.5f) {
            row.setOrientation(LinearLayout.VERTICAL);
            row.addView(name, new LinearLayout.LayoutParams(-1, -2));
            statusValue.setPadding(0, dp(3), 0, 0);
            row.addView(statusValue, new LinearLayout.LayoutParams(-1, -2));
            return row;
        }
        statusValue.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        row.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(statusValue, new LinearLayout.LayoutParams(0, -2, 1.65f));
        return row;
    }

    /** Grafico sfumato dell'ultimo minuto con valore corrente a destra. */
    public LinearLayout chartRow(String label, int initialValue) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(5), 0, dp(5));
        TextView name = text(label, 11, MUTED);
        SparklineView chart = new SparklineView(context);
        chart.setTag("chart:" + label);
        chart.add(initialValue);
        TextView value = text(initialValue + "%", 12, TEXT);
        value.setTag("chart-value:" + label);
        value.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        name.setMinWidth(dp(50));
        name.setPadding(0, 0, dp(8), 0);
        value.setMinWidth(dp(50));
        value.setPadding(dp(8), 0, 0, 0);
        row.addView(name, new LinearLayout.LayoutParams(-2, -2));
        row.addView(chart, new LinearLayout.LayoutParams(0, dp(34), 1));
        row.addView(value, new LinearLayout.LayoutParams(-2, -2));
        return row;
    }

    public LinearLayout.LayoutParams wrapBlock() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(6), 0, dp(6));
        return params;
    }

    /** Colonna con margine sinistro, per righe a più elementi affiancati. */
    public LinearLayout.LayoutParams spaced(int width, int height, float weight, int gap) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height, weight);
        params.setMargins(dp(gap), 0, 0, 0);
        return params;
    }

    /** Pulsante Nexus: feedback aptico al tocco, spento ma leggibile se disattivato. */
    private static final class NexusButton extends Button {
        NexusButton(Context context) { super(context); }
        @Override public boolean performClick() { performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK); return super.performClick(); }
        @Override public void setEnabled(boolean enabled) { super.setEnabled(enabled); setAlpha(enabled ? 1f : .44f); }
    }
}

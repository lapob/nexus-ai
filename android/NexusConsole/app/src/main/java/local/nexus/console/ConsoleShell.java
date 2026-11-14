package local.nexus.console;

import local.nexus.console.ui.MaterializationView;
import local.nexus.console.ui.Motion;
import local.nexus.console.ui.NexusUi;
import local.nexus.motion.NexusMotion;
import local.nexus.motion.NexusSystemBars;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import java.util.function.Predicate;

/**
 * Struttura fissa della finestra, senza header, navbar o footer persistenti:
 * un unico scroller edge-to-edge con il contenuto della schermata corrente,
 * la navigazione della dashboard sovrapposta in alto, il dock Riavvia/Spegni
 * in basso, il velo che protegge la status bar e il velo di materializzazione.
 *
 * Ogni schermata sostituisce il contenuto con {@link #swapContent}, che
 * applica la stessa transizione direzionale e l'entrata a onda.
 */
final class ConsoleShell {
    interface Host {
        boolean isClosed();
        /** La dashboard è la superficie visibile: navigazione e dock restano. */
        boolean dashboardShowing();
    }

    final LinearLayout root;
    final LinearLayout content;
    final LinearLayout navigation;
    final ScrollView scroll;
    final LinearLayout powerDock;
    final ControlBackdropView backdrop;
    private final MaterializationView materializationOverlay;
    private final View statusFrostOverlay;
    private final Activity activity;
    private final NexusUi ui;
    private final Motion motion;
    private final Host host;
    private int frostedStatusStep = -1;
    private int contentSwapGeneration;
    private boolean reverseContentTransition;
    private boolean materializeNextContent;
    private boolean dockScrollCandidate, dockScrollActive;
    private float dockTouchX, dockTouchY;

    ConsoleShell(Activity activity, NexusUi ui, LinearLayout powerDock, Host host) {
        this.activity = activity;
        this.ui = ui;
        this.motion = ui.motion();
        this.powerDock = powerDock;
        this.host = host;
        scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        // Lo spazio sicuro appartiene allo scroller, non alla finestra: con
        // clipToPadding disattivato il contenuto in movimento continua dietro
        // status e navigation bar, restando leggibile attraverso il velo Nexus.
        scroll.setClipToPadding(false);
        root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(0, 0, 0, 0);
        root.setBackground(ui.cosmicBackground());
        content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(6), dp(18), dp(18));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        FrameLayout viewport = new FrameLayout(activity);
        navigation = new LinearLayout(activity);
        navigation.setOrientation(LinearLayout.VERTICAL);
        navigation.setVisibility(View.GONE);
        // La barra sovrapposta lascia scorrere i contenuti sotto la sua coda
        // sfumata; il padding dello scroller segue la misura reale del titolo.
        int veil = Color.argb(218, 2, 6, 7);
        navigation.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{veil, veil, veil, veil, veil, veil, veil, Color.TRANSPARENT}));
        viewport.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        backdrop = new ControlBackdropView(activity, scroll);
        viewport.addView(backdrop, new FrameLayout.LayoutParams(-1, -1));
        viewport.addView(navigation, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        navigation.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (bottom - top != oldBottom - oldTop) root.requestApplyInsets();
        });
        materializationOverlay = new MaterializationView(activity, motion);
        materializationOverlay.setVisibility(View.GONE);
        viewport.addView(materializationOverlay, new FrameLayout.LayoutParams(-1, -1));
        // Android 15 puo ignorare il colore della status bar nelle finestre
        // edge-to-edge. Un velo interno, non interattivo, mantiene quindi lo
        // stesso contrasto su ogni versione senza acquisire tocchi o focus.
        statusFrostOverlay = new View(activity);
        statusFrostOverlay.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        statusFrostOverlay.setClickable(false);
        statusFrostOverlay.setFocusable(false);
        viewport.addView(statusFrostOverlay, new FrameLayout.LayoutParams(-1, 0, Gravity.TOP));
        // Il vetro superiore cresce solo mentre del contenuto gli scorre
        // dietro. Ventiquattro livelli evitano invalidazioni ridondanti e
        // mantengono l'effetto continuo anche su GPU meno recenti.
        scroll.setOnScrollChangeListener((view, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            backdrop.postInvalidateOnAnimation();
            float progress = Math.min(1f, Math.max(0f, scrollY) / (float) dp(56));
            int step = Math.round(progress * 24f);
            if (step == frostedStatusStep) return;
            frostedStatusStep = step;
            updateStatusFrost(step / 24f);
        });
        updateStatusFrost(0f);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int horizontal = activity.getResources().getDisplayMetrics().widthPixels < dp(360) ? dp(12) : dp(18);
            content.setPadding(horizontal, dp(6), horizontal, dp(18));
            @SuppressWarnings("deprecation") int topInset = insets.getSystemWindowInsetTop();
            @SuppressWarnings("deprecation") int bottomInset = insets.getSystemWindowInsetBottom();
            boolean navigationVisible = navigation.getVisibility() == View.VISIBLE;
            boolean dockVisible = powerDock.getVisibility() == View.VISIBLE;
            navigation.setPadding(horizontal, topInset + dp(8), horizontal, dp(16));
            int navigationHeight = navigationVisible ? navigation.getHeight() : topInset;
            scroll.setPadding(0, navigationHeight, 0, dp(10) + bottomInset + (dockVisible ? powerDock.getHeight() : 0));
            backdrop.setBands(navigationVisible ? navigationHeight : 0, dockVisible ? powerDock.getHeight() : 0);
            powerDock.setPadding(horizontal, dp(32), horizontal, dp(8) + bottomInset);
            FrameLayout.LayoutParams frostParams = (FrameLayout.LayoutParams) statusFrostOverlay.getLayoutParams();
            frostParams.height = topInset + dp(14);
            statusFrostOverlay.setLayoutParams(frostParams);
            return insets;
        });
        root.addView(viewport, new LinearLayout.LayoutParams(-1, 0, 1));
        powerDock.setPadding(dp(18), dp(32), dp(18), dp(12));
        powerDock.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.TRANSPARENT, Color.argb(225, 2, 6, 7), NexusUi.BG, NexusUi.BG}));
        powerDock.setVisibility(View.GONE);
        viewport.addView(powerDock, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        powerDock.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (bottom - top != oldBottom - oldTop) root.requestApplyInsets();
        });
        for (int i = 0; i < powerDock.getChildCount(); i++) powerDock.getChildAt(i).setEnabled(false);
    }

    int dp(int value) { return ui.dp(value); }

    int contentGeneration() { return contentSwapGeneration; }

    /** La prossima superficie si materializza dal velo di particelle. */
    void materializeNext() { materializeNextContent = true; }

    /** La prossima transizione va all'indietro (ritorno da una conferma). */
    void reverseNext() { reverseContentTransition = true; }

    void materializeNow() { materializationOverlay.materialize(); }

    /** Budget grafico cambiato: le viste disegnate rileggono il profilo al prossimo frame. */
    void invalidateMotion() {
        content.invalidate();
        materializationOverlay.invalidate();
    }

    private void updateStatusFrost(float progress) {
        float clamped = Math.max(0f, Math.min(1f, progress));
        float eased = 1f - ((1f - clamped) * (1f - clamped));
        NexusSystemBars.updateFrostedStatus(activity.getWindow(), eased);
        int topAlpha = Math.round(82f + (173f * eased));
        int edgeAlpha = Math.round(34f + (201f * eased));
        int top = Color.argb(topAlpha, 2, 6, 7);
        statusFrostOverlay.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{top, top, top, Color.argb(edgeAlpha, 2, 6, 7), Color.TRANSPARENT}));
    }

    // #region Barre: navigazione della dashboard e dock di alimentazione

    void showNavigation() {
        navigation.setVisibility(View.VISIBLE);
        navigation.getRootView().requestApplyInsets();
    }

    void hideNavigation() {
        if (navigation.getVisibility() == View.GONE) return;
        navigation.setVisibility(View.GONE);
        navigation.getRootView().requestApplyInsets();
    }

    /** Il dock compare solo sulla dashboard e i comandi solo con sessione e server raggiungibile. */
    void setDock(boolean visible, boolean enabled) {
        int visibility = visible ? View.VISIBLE : View.GONE;
        if (powerDock.getVisibility() != visibility) {
            powerDock.setVisibility(visibility);
            powerDock.getRootView().requestApplyInsets();
        }
        for (int i = 0; i < powerDock.getChildCount(); i++) powerDock.getChildAt(i).setEnabled(visible && enabled);
    }

    /**
     * Un trascinamento verticale che parte sul dock scorre la dashboard, come
     * se il dock fosse trasparente; un tocco orizzontale resta ai pulsanti.
     * Restituisce true se l'evento è stato consumato.
     */
    boolean routeDockScroll(MotionEvent event, boolean dashboard, Predicate<MotionEvent> dispatchToWindow) {
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            dockScrollActive = false;
            dockTouchX = event.getRawX();
            dockTouchY = event.getRawY();
            int[] location = new int[2];
            powerDock.getLocationOnScreen(location);
            dockScrollCandidate = dashboard && powerDock.getVisibility() == View.VISIBLE
                && dockTouchX >= location[0] && dockTouchX < location[0] + powerDock.getWidth()
                && dockTouchY >= location[1] && dockTouchY < location[1] + powerDock.getHeight();
        }
        if (dockScrollCandidate && action == MotionEvent.ACTION_MOVE && !dockScrollActive && event.getPointerCount() == 1) {
            float dx = Math.abs(event.getRawX() - dockTouchX);
            float dy = Math.abs(event.getRawY() - dockTouchY);
            int slop = ViewConfiguration.get(activity).getScaledTouchSlop();
            if (dy > slop && dy > dx) {
                MotionEvent cancel = MotionEvent.obtain(event);
                cancel.setAction(MotionEvent.ACTION_CANCEL);
                dispatchToWindow.test(cancel);
                cancel.recycle();
                int[] location = new int[2];
                scroll.getLocationOnScreen(location);
                MotionEvent down = MotionEvent.obtain(event);
                down.setAction(MotionEvent.ACTION_DOWN);
                down.setLocation(dockTouchX - location[0], dockTouchY - location[1]);
                scroll.dispatchTouchEvent(down);
                down.recycle();
                dockScrollActive = true;
            } else if (dx > slop && dx > dy) dockScrollCandidate = false;
        }
        if (dockScrollActive) {
            int[] location = new int[2];
            scroll.getLocationOnScreen(location);
            MotionEvent forwarded = MotionEvent.obtain(event);
            forwarded.setLocation(event.getRawX() - location[0], event.getRawY() - location[1]);
            scroll.dispatchTouchEvent(forwarded);
            forwarded.recycle();
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                dockScrollCandidate = false;
                dockScrollActive = false;
            }
            return true;
        }
        if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) dockScrollCandidate = false;
        return false;
    }

    // #endregion

    // #region Transizioni

    /** Gesto Indietro predittivo: il contenuto arretra appena verso il bordo di partenza. */
    void backProgress(float progress, boolean fromLeftEdge) {
        if (!motion.enabled()) return;
        content.setScaleX(1f - .025f * progress);
        content.setScaleY(1f - .025f * progress);
        content.setTranslationX(dp(16) * progress * (fromLeftEdge ? 1 : -1));
    }

    void backCancelled() {
        content.animate().scaleX(1f).scaleY(1f).translationX(0f)
            .setDuration(motion.duration(NexusMotion.EXIT)).setInterpolator(motion.standard()).start();
    }

    /** Nessuna trasformazione residua: usato in pausa e prima di ogni nuova superficie. */
    void settleContent() {
        content.animate().cancel();
        content.setAlpha(1f);
        content.setTranslationY(0f);
        content.setTranslationX(0f);
        content.setScaleX(1f);
        content.setScaleY(1f);
    }

    void swapContent(Runnable render) {
        int generation = ++contentSwapGeneration;
        boolean reverse = reverseContentTransition;
        boolean materialize = materializeNextContent;
        if (materialize) materializeNextContent = false;
        reverseContentTransition = false;
        // The content container must never remain transparent when a refresh
        // supersedes a pending transition.  Network telemetry can legitimately
        // trigger several swaps in quick succession on resume.
        settleContent();
        content.removeAllViews();
        render.run();
        if (!host.dashboardShowing()) hideNavigation();
        if (!motion.enabled()) return;
        // Entrata breve e continua: la distanza resta minima per evitare
        // scatti anche su telefoni a 60 Hz, mentre opacita e scala ricreano
        // la morbidezza dei pannelli originali. Android disattiva tutto in
        // risparmio energetico o quando le animazioni di sistema sono spente.
        content.setAlpha(materialize ? .42f : NexusMotion.CONTENT_START_ALPHA);
        content.setScaleX(materialize ? .978f : NexusMotion.CONTENT_START_SCALE);
        content.setScaleY(materialize ? .978f : NexusMotion.CONTENT_START_SCALE);
        content.setTranslationY(materialize ? dp(7) : dp(4));
        content.setTranslationX(materialize ? 0f : reverse ? -dp(NexusMotion.CONTENT_TRAVEL_DP) : dp(NexusMotion.CONTENT_TRAVEL_DP));
        if (materialize) materializationOverlay.materialize();
        if (materialize) cascadeChildren(content, generation);
        content.postOnAnimation(() -> {
            if (host.isClosed() || generation != contentSwapGeneration) {
                settleContent();
                return;
            }
            content.animate()
                .alpha(1f)
                .scaleX(1f)
                .scaleY(1f)
                .translationX(0f)
                .translationY(0f)
                .setDuration(motion.duration(materialize ? NexusMotion.MATERIALIZE : NexusMotion.CONTENT_SWAP))
                .setInterpolator(motion.emphasized())
                .withEndAction(this::settleContent)
                .start();
        });
    }

    /**
     * Entrata a cascata all'apertura di una schermata: solo all'ingresso (non ai
     * refresh della telemetria) e mai con animazioni ridotte; un nuovo swap
     * riporta subito tutto allo stato finale.
     */
    private void cascadeChildren(LinearLayout parent, int generation) {
        // Sul cruscotto l'unico figlio visibile e la sezione attiva: l'onda deve
        // attraversare le sue schede, non il contenitore che le raccoglie.
        ViewGroup target = parent;
        int visible = 0;
        View only = null;
        for (int index = 0; index < parent.getChildCount(); index++) {
            View child = parent.getChildAt(index);
            if (child.getVisibility() == View.VISIBLE) { visible++; only = child; }
        }
        if (visible == 1 && only instanceof LinearLayout && ((LinearLayout) only).getChildCount() > 1) target = (LinearLayout) only;
        motion.waveChildren(target, NexusMotion.PRESS / 2, () -> generation == contentSwapGeneration);
    }

    // #endregion
}

package local.nexus.console;

import android.content.Context;
import android.hardware.display.DisplayManager;
import android.view.Choreographer;
import android.view.Display;

/** Misura esclusivamente i tempi dei frame e adatta il budget, senza acquisire contenuti o input. */
final class FrameBudgetMonitor implements Choreographer.FrameCallback {
    interface Listener { void onBudgetChanged(boolean constrained, float slowRatio); }

    private final Context context;
    private final Listener listener;
    private boolean running;
    private boolean constrained;
    private boolean hasSmoothedSample;
    private int healthyWindows;
    private long previousNanos;
    private long windowFrames;
    private long windowSlowFrames;
    private long slowFrameThresholdNanos = 24_000_000L;
    private float smoothedSlowRatio;

    FrameBudgetMonitor(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    boolean isConstrained() { return constrained; }

    void start() {
        if (running) return;
        running = true;
        previousNanos = 0;
        updateFrameBudget();
        Choreographer.getInstance().postFrameCallback(this);
    }

    void stop() {
        running = false;
        Choreographer.getInstance().removeFrameCallback(this);
        if (windowFrames > 0) completeWindow();
    }

    void refreshBudget() { updateFrameBudget(); }

    @Override public void doFrame(long frameTimeNanos) {
        if (!running) return;
        if (previousNanos > 0) {
            long duration = frameTimeNanos - previousNanos;
            windowFrames++;
            if (duration > slowFrameThresholdNanos) windowSlowFrames++;
        }
        previousNanos = frameTimeNanos;
        if (windowFrames >= 180) completeWindow();
        Choreographer.getInstance().postFrameCallback(this);
    }

    private void updateFrameBudget() {
        DisplayManager manager = context.getSystemService(DisplayManager.class);
        Display display = manager == null ? null : manager.getDisplay(Display.DEFAULT_DISPLAY);
        float refreshRate = display == null ? 60f : Math.max(30f, display.getRefreshRate());
        slowFrameThresholdNanos = Math.max(12_000_000L, (long) ((1_000_000_000d / refreshRate) * 1.5d));
    }

    private void completeWindow() {
        float measured = windowFrames == 0 ? 0f : (float) windowSlowFrames / (float) windowFrames;
        smoothedSlowRatio = hasSmoothedSample ? smoothedSlowRatio * .65f + measured * .35f : measured;
        hasSmoothedSample = true;
        boolean previous = constrained;
        if (!constrained && smoothedSlowRatio >= .12f) {
            constrained = true;
            healthyWindows = 0;
        } else if (constrained) {
            healthyWindows = smoothedSlowRatio <= .05f ? healthyWindows + 1 : 0;
            if (healthyWindows >= 3) {
                constrained = false;
                healthyWindows = 0;
            }
        }
        context.getSharedPreferences("nexus_console", Context.MODE_PRIVATE).edit()
            .putFloat("frameHealth.recentSlowRatio", smoothedSlowRatio)
            .putBoolean("frameHealth.constrained", constrained)
            .apply();
        windowFrames = 0;
        windowSlowFrames = 0;
        if (previous != constrained && listener != null) listener.onBudgetChanged(constrained, smoothedSlowRatio);
    }
}

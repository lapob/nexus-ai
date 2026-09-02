package local.nexus.remote;

import android.content.Context;
import android.hardware.display.DisplayManager;
import android.view.Display;
import android.view.Choreographer;

/** Misura solo tempi dei frame, senza contenuti, input o identificatori personali. */
final class FrameHealthMonitor implements Choreographer.FrameCallback {
    private final Context context;
    private boolean running;
    private boolean hasSmoothedSample;
    private boolean constrained;
    private int healthyWindows;
    private float smoothedSlowRatio;
    private long previousNanos, frames, slowFrames, worstNanos, windowFrames, windowSlowFrames;
    private long slowFrameThresholdNanos = 24_000_000L;
    FrameHealthMonitor(Context context) { this.context = context.getApplicationContext(); }
    void start() {
        if (!running) {
            running = true;
            previousNanos = 0;
            updateFrameBudget();
            Choreographer.getInstance().postFrameCallback(this);
        }
    }
    void stop() { running = false; Choreographer.getInstance().removeFrameCallback(this); if (windowFrames > 0) persistWindow(); persist(); }
    @Override public void doFrame(long frameTimeNanos) {
        if (!running) return;
        if (previousNanos > 0) {
            long duration = frameTimeNanos - previousNanos;
            frames++; windowFrames++;
            if (duration > slowFrameThresholdNanos) { slowFrames++; windowSlowFrames++; }
            worstNanos = Math.max(worstNanos, duration);
        }
        previousNanos = frameTimeNanos;
        if (windowFrames >= 120) persistWindow();
        if (frames > 0 && frames % 300 == 0) persist();
        Choreographer.getInstance().postFrameCallback(this);
    }
    private void updateFrameBudget() {
        DisplayManager manager = context.getSystemService(DisplayManager.class);
        Display display = manager == null ? null : manager.getDisplay(Display.DEFAULT_DISPLAY);
        float refreshRate = display == null ? 60f : Math.max(30f, display.getRefreshRate());
        // Un frame è lento dopo circa un frame e mezzo. A 120 Hz rileviamo così
        // i 16 ms che la precedente soglia fissa da 24 ms lasciava invisibili.
        slowFrameThresholdNanos = Math.max(12_000_000L, (long) ((1_000_000_000d / refreshRate) * 1.5d));
    }
    private void persistWindow() {
        float ratio = windowFrames == 0 ? 0f : (float) windowSlowFrames / (float) windowFrames;
        smoothedSlowRatio = hasSmoothedSample ? smoothedSlowRatio * .65f + ratio * .35f : ratio;
        hasSmoothedSample = true;
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
        context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE).edit()
            .putFloat("frameHealth.recentSlowRatio", smoothedSlowRatio)
            .putBoolean("frameHealth.constrained", constrained)
            .apply();
        windowFrames = 0; windowSlowFrames = 0;
    }
    private void persist() { context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE).edit().putLong("frameHealth.frames", frames).putLong("frameHealth.slow", slowFrames).putLong("frameHealth.worstMs", worstNanos / 1_000_000L).apply(); }
}

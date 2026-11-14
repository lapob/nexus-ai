package local.nexus.console.ui;

import local.nexus.console.R;
import local.nexus.motion.NexusCoreBreath;
import local.nexus.motion.NexusMotion;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.ActivityManager;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;
import android.view.animation.PathInterpolator;

import java.util.function.BooleanSupplier;

/**
 * Profilo di movimento condiviso da tutte le schermate di Control.
 *
 * Durate e curve vengono dai token di {@link NexusMotion}; qui si decide
 * soltanto se animare (movimento ridotto di sistema, app in background) e
 * quanto alleggerire il lavoro grafico (RAM ridotta, risparmio energetico,
 * frame lenti misurati da FrameBudgetMonitor).
 */
public final class Motion {
    /** Vero finché l'Activity è viva e in primo piano. */
    public interface Presence { boolean active(); }

    private final Presence presence;
    private float scale = 1f;
    private boolean baselineLowBudget;
    private boolean frameConstrained;

    public Motion(Presence presence) {
        this.presence = presence;
    }

    /** Legge RAM, risparmio energetico e frequenza dello schermo. */
    @SuppressWarnings("deprecation")
    public void configure(Activity activity, boolean constrained) {
        ActivityManager activityManager = activity.getSystemService(ActivityManager.class);
        boolean lowRam = activityManager != null && activityManager.isLowRamDevice();
        PowerManager powerManager = activity.getSystemService(PowerManager.class);
        boolean powerSave = powerManager != null && powerManager.isPowerSaveMode();
        float refreshRate = activity.getWindowManager().getDefaultDisplay().getRefreshRate();
        baselineLowBudget = lowRam || powerSave;
        frameConstrained = constrained;
        scale = NexusMotion.profileScale(lowRam, powerSave, refreshRate);
    }

    /** Aggiorna il budget dai frame reali; restituisce true se è cambiato. */
    public boolean setFrameConstrained(boolean constrained) {
        boolean before = lowBudget();
        frameConstrained = constrained;
        return before != lowBudget();
    }

    public boolean lowBudget() { return baselineLowBudget || frameConstrained; }

    public float scale() { return scale; }

    /** Movimento ridotto rispettato: animatori di sistema spenti = nessuna animazione. */
    public boolean enabled() {
        return presence.active() && ValueAnimator.areAnimatorsEnabled();
    }

    public long duration(int baseMs) {
        return NexusMotion.duration(baseMs, scale, enabled());
    }

    public PathInterpolator standard() {
        return new PathInterpolator(NexusMotion.STANDARD_X1, NexusMotion.STANDARD_Y1, NexusMotion.STANDARD_X2, NexusMotion.STANDARD_Y2);
    }

    public PathInterpolator emphasized() {
        return new PathInterpolator(NexusMotion.EMPHASIZED_X1, NexusMotion.EMPHASIZED_Y1, NexusMotion.EMPHASIZED_X2, NexusMotion.EMPHASIZED_Y2);
    }

    /**
     * Entrata a onda: ogni blocco sale, si posa (scala .965 -> 1) e si accende in
     * sequenza con un passo che accelera. Con animazioni ridotte tutto e subito
     * nello stato finale; una rete di sicurezza impedisce blocchi trasparenti.
     */
    public void waveChildren(ViewGroup parent, int leadMs, BooleanSupplier current) {
        int count = Math.min(parent.getChildCount(), NexusMotion.WAVE_LIMIT);
        boolean moving = enabled();
        boolean low = lowBudget();
        float density = parent.getResources().getDisplayMetrics().density;
        float travel = Math.round((low ? NexusMotion.CASCADE_TRAVEL_DP / 2 : NexusMotion.CASCADE_TRAVEL_DP) * density);
        float scale = low ? 1f - (1f - NexusMotion.WAVE_START_SCALE) / 2f : NexusMotion.WAVE_START_SCALE;
        long step = duration(NexusMotion.CASCADE_STEP) + (low ? 0 : 18);
        for (int index = 0; index < parent.getChildCount(); index++) {
            View child = parent.getChildAt(index);
            child.animate().cancel();
            if (!moving || index >= count) {
                settle(child);
                continue;
            }
            child.setAlpha(0f);
            child.setTranslationY(travel);
            child.setScaleX(scale);
            child.setScaleY(scale);
            child.animate()
                .alpha(1f)
                .translationY(0f)
                .scaleX(1f)
                .scaleY(1f)
                .setStartDelay(duration(leadMs) + NexusMotion.waveDelay(index, step))
                .setDuration(duration(NexusMotion.WAVE_ENTER))
                .setInterpolator(emphasized())
                .withEndAction(() -> settle(child))
                .start();
        }
        if (!moving) return;
        // Rete di sicurezza: anche se un'animazione viene interrotta (vista
        // riutilizzata da un refresh), nessun blocco resta trasparente.
        View[] animated = new View[count];
        for (int index = 0; index < count; index++) animated[index] = parent.getChildAt(index);
        parent.postDelayed(() -> {
            for (View child : animated) {
                if (!current.getAsBoolean() && child.getAlpha() < 1f) child.animate().cancel();
                if (!current.getAsBoolean() || child.getAlpha() < 1f) settle(child);
            }
        }, 1_600L);
    }

    private static void settle(View child) {
        child.setAlpha(1f); child.setTranslationY(0f); child.setScaleX(1f); child.setScaleY(1f);
    }

    /**
     * Respiro dell'indicatore di presenza allineato al nucleo web/desktop: stessa
     * inspirazione di {@link NexusCoreBreath}, calcolata dal tempo reale (identica a
     * 60/120 Hz). Si ferma da sola quando la vista esce o le animazioni si spengono.
     */
    public void breathe(View view) {
        view.animate().cancel();
        Object previous = view.getTag(R.id.nexus_breath_animator);
        if (previous instanceof ValueAnimator) ((ValueAnimator) previous).cancel();
        if (!enabled()) {
            view.setAlpha(1f); view.setScaleX(1f); view.setScaleY(1f);
            return;
        }
        long born = SystemClock.uptimeMillis();
        ValueAnimator clock = ValueAnimator.ofFloat(0f, 1f);
        clock.setDuration(NexusCoreBreath.CYCLE_MS);
        clock.setRepeatCount(ValueAnimator.INFINITE);
        clock.setInterpolator(new LinearInterpolator());
        clock.addUpdateListener(animation -> {
            if (!enabled() || !view.isAttachedToWindow()) {
                animation.cancel();
                view.setAlpha(1f); view.setScaleX(1f); view.setScaleY(1f);
                return;
            }
            float seconds = (SystemClock.uptimeMillis() - born) / 1000f;
            float inhale = NexusCoreBreath.inhale(seconds);
            float zoom = NexusCoreBreath.zoom(seconds);
            view.setAlpha(.46f + .54f * inhale);
            view.setScaleX(zoom * (.94f + .1f * inhale));
            view.setScaleY(zoom * (.94f + .1f * inhale));
        });
        view.setTag(R.id.nexus_breath_animator, clock);
        clock.start();
    }
}

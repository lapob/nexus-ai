package local.nexus.motion;

import android.graphics.Color;
import android.os.Build;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/** Unica policy edge-to-edge per tutte le superfici Android NexusNXS. */
public final class NexusSystemBars {
    private static final int COSMIC_SCRIM = Color.argb(166, 2, 6, 7);
    private static final int FROSTED_COSMIC_SCRIM = Color.argb(82, 2, 6, 7);
    private static final int FROSTED_STATUS_MAX_ALPHA = 116;

    private NexusSystemBars() {}

    public static void apply(Window window) {
        apply(window, COSMIC_SCRIM);
    }

    /** Variante frosted per le superfici private edge-to-edge. */
    public static void applyFrosted(Window window) {
        // A riposo le due barre condividono lo stesso velo. Lo scroller puo
        // intensificare soltanto la status bar quando il contenuto le passa
        // dietro; la navigation bar resta quindi stabile e senza stacchi.
        apply(window, FROSTED_COSMIC_SCRIM, FROSTED_COSMIC_SCRIM);
    }

    /**
     * Modula il vetro superiore con lo scroll senza overlay, snapshot o blur
     * software. Il risultato conserva la fluidita anche sui dispositivi lenti
     * e lascia invariata la navigation bar gestita dal sistema.
     */
    public static void updateFrostedStatus(Window window, float progress) {
        float clamped = Math.max(0f, Math.min(1f, progress));
        float eased = 1f - ((1f - clamped) * (1f - clamped));
        int alpha = Math.round(82f + ((FROSTED_STATUS_MAX_ALPHA - 82f) * eased));
        window.setStatusBarColor(Color.argb(alpha, 2, 6, 7));
    }

    private static void apply(Window window, int scrim) {
        apply(window, scrim, scrim);
    }

    private static void apply(Window window, int statusScrim, int navigationScrim) {
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // Il contenuto dell'app resta visibile attraverso le aree di sistema:
        // il velo cosmico protegge la leggibilità senza creare bande nere nette.
        window.setStatusBarColor(statusScrim);
        window.setNavigationBarColor(navigationScrim);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }
}

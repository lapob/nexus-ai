package local.nexus.motion;

/**
 * Grammatica di movimento unica per tutti i client Android NexusNXS.
 *
 * Le Activity possono usare tecnologie diverse (Compose o View native), ma
 * durate, curve e profilo adattivo restano definiti qui. In questo modo un
 * ritocco non crea velocita o sensazioni differenti tra le due applicazioni.
 */
public final class NexusMotion {
    private NexusMotion() {}

    public static final int ENTER = 260;
    public static final int EXIT = 180;
    public static final int QUICK = 170;
    public static final int FADE_DELAY = 12;
    public static final int REDUCED = 1;
    public static final int THINKING_PULSE = 760;
    public static final int CURSOR_PULSE = 520;
    public static final int STREAM_FADE = 250;
    public static final int COMPOSER_RESIZE = 130;
    public static final int VOICE_WAVE = 1050;
    public static final int SKELETON_PULSE = 820;
    public static final int PARTICLE_BUDGET = 480;
    public static final int PARTICLE_TICK = 1000;
    public static final int CONTENT_SWAP = 320;
    public static final int MATERIALIZE = 430;
    public static final int STATUS_PULSE = 360;
    public static final int AMBIENT_PULSE = 950;
    public static final int PRESS = 85;
    public static final int RELEASE = 180;
    public static final int CORE_RELEASE = 650;
    /** Ritardo tra un blocco e il successivo nell'entrata a cascata di una schermata. */
    public static final int CASCADE_STEP = 34;
    /** Distanza verticale dell'entrata a cascata (dp). */
    public static final int CASCADE_TRAVEL_DP = 12;
    /** Entrata a onda: durata di ciascun blocco e scala iniziale (si "posa" sul piano). */
    public static final int WAVE_ENTER = 420;
    public static final float WAVE_START_SCALE = .965f;
    /** Massimo numero di blocchi che partecipano all'onda: oltre, compaiono insieme. */
    public static final int WAVE_LIMIT = 10;
    /** Cambio sezione: scorrimento laterale breve nella direzione della scheda scelta. */
    public static final int SECTION_SWAP = 360;
    public static final int SECTION_TRAVEL_DP = 22;

    /**
     * Ritardo del blocco {@code index} nell'onda: il passo si accorcia man mano,
     * cosi l'onda accelera e una lista lunga non sembra mai lenta.
     */
    public static long waveDelay(int index, long stepMs) {
        return Math.round(stepMs * Math.pow(Math.max(0, index), .82));
    }

    public static final float STANDARD_X1 = .20f;
    public static final float STANDARD_Y1 = 0f;
    public static final float STANDARD_X2 = .20f;
    public static final float STANDARD_Y2 = 1f;
    public static final float EMPHASIZED_X1 = .20f;
    public static final float EMPHASIZED_Y1 = 0f;
    public static final float EMPHASIZED_X2 = 0f;
    public static final float EMPHASIZED_Y2 = 1f;

    public static final float CONTENT_START_ALPHA = .76f;
    public static final float CONTENT_START_SCALE = .987f;
    public static final int CONTENT_TRAVEL_DP = 16;

    public static float profileScale(boolean lowRam, boolean powerSave, float refreshRate) {
        if (lowRam || powerSave) return .68f;
        if (refreshRate >= 120f) return .72f;
        if (refreshRate >= 90f) return .82f;
        return 1f;
    }

    public static long duration(int baseMs, float profileScale, boolean enabled) {
        return enabled ? Math.max(60L, Math.round(baseMs * profileScale)) : 0L;
    }
}

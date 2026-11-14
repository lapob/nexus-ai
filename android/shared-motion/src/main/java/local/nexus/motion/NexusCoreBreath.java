package local.nexus.motion;

/**
 * Respiro del nucleo NexusNXS, traduzione esatta di {@code web/src/core-breath.ts}.
 *
 * Il nucleo si scompone e si ricompone a onda: un ciclo fiorisce verso l'esterno
 * (zoom in), il successivo collassa in un cuore denso (zoom out). Tutto dipende
 * solo dal tempo trascorso, quindi il movimento e identico a 60, 90 e 120 Hz e
 * non accelera mai quando il display aumenta la frequenza.
 */
public final class NexusCoreBreath {
    private NexusCoreBreath() {}

    /** Un respiro in tempo "ambiente" (0,8x il tempo reale): circa 13,75 s. */
    public static final float PERIOD = 11f;
    public static final float RATE = .8f;
    /** Durata reale di un ciclo completo (fioritura oppure collasso), in millisecondi. */
    public static final long CYCLE_MS = Math.round(PERIOD / RATE * 1000f);

    private static final float TAU = 6.2831853f;

    private static float smoother(float t) {
        float x = Math.min(1f, Math.max(0f, t));
        return x * x * x * (x * (x * 6f - 15f) + 10f);
    }

    /**
     * 0 = forma composta; verso +1 fiorisce, verso -1 collassa. {@code stagger}
     * sfasa ogni particella. Vale 0 con pendenza nulla a ogni confine di ciclo.
     */
    public static float breath(float seconds, float stagger) {
        float cycle = seconds * RATE / PERIOD - stagger;
        float index = (float) Math.floor(cycle);
        float phase = cycle - index;
        float scatter = smoother((phase - .34f) / .22f) * (1f - smoother((phase - .66f) / .3f));
        return (((long) index) & 1L) == 0L ? scatter : -scatter;
    }

    /**
     * Sposta un punto in spazio unitario lungo il respiro {@code b}: flusso coerente,
     * mai rumore. Scrive x, y, z in {@code out[0..2]} senza allocare.
     */
    public static void breathePoint(float[] out, float x, float y, float z, float b, float seed, float seconds) {
        float s = Math.abs(b);
        if (s < 1e-4f) { out[0] = x; out[1] = y; out[2] = z; return; }
        float t = seconds * RATE;
        float flow = (float) (Math.sin(x * 4.1f + t * .21f + seed * TAU) * 1.7 + Math.cos(y * 3.3f - t * .17f) * 1.7);
        float fx = (float) Math.cos(flow), fy = (float) Math.sin(flow);
        if (b > 0f) {
            float grow = 1f + .44f * s * (.6f + .4f * seed);
            float c = (float) Math.cos(.38f * s), n = (float) Math.sin(.38f * s);
            out[0] = (x * c - y * n) * grow + fx * .13f * s;
            out[1] = (x * n + y * c) * grow + fy * .13f * s;
            out[2] = z * grow + (float) Math.sin(flow * 1.3f + seed * TAU) * .1f * s;
        } else {
            float shrink = 1f - .58f * s * (.55f + .45f * seed);
            float c = (float) Math.cos(-1.05f * s), n = (float) Math.sin(-1.05f * s);
            out[0] = (x * c - y * n) * shrink + fx * .035f * s;
            out[1] = (x * n + y * c) * shrink + fy * .035f * s;
            out[2] = z * shrink;
        }
    }

    /** Zoom dell'intero nucleo, leggermente in anticipo sui grani, con un'inspirazione morbida. */
    public static float zoom(float seconds) {
        float t = seconds * RATE;
        return 1f + .1f * breath(seconds, -.03f) + .018f * (float) Math.sin(t * TAU / (PERIOD / 3f));
    }

    /** Inspirazione lenta (0..1) per indicatori minori che devono respirare insieme al nucleo. */
    public static float inhale(float seconds) {
        float t = seconds * RATE;
        return .5f + .5f * (float) Math.sin(t * TAU / (PERIOD / 3f));
    }
}

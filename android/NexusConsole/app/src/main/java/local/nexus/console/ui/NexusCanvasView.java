package local.nexus.console.ui;

import android.annotation.SuppressLint;
import android.content.Context;
import android.view.View;

/**
 * Base delle viste disegnate a mano di Control: non interattive, escluse dal
 * lettore di schermo quando decorative, con accesso al profilo di movimento.
 * Le viste non vengono mai gonfiate da XML, da qui il costruttore dedicato.
 */
@SuppressLint("ViewConstructor")
public abstract class NexusCanvasView extends View {
    protected final Motion motion;

    protected NexusCanvasView(Context context, Motion motion) {
        super(context);
        this.motion = motion;
    }

    protected final int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}

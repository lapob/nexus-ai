package local.nexus.remote

import android.app.ActivityManager
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import local.nexus.motion.NexusSystemBars

/**
 * Entry point traslucido posseduto da Android per il richiamo dell'assistente.
 * Condivide rete, memoria e Core con NexusMainActivity, ma non mostra la UI completa.
 */
class NexusAssistantActivity : NexusMainActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureAdaptiveSystemBackdrop()
    }

    override fun onResume() {
        super.onResume()
        configureAdaptiveSystemBackdrop()
    }

    override fun onAssistantPresentationChanged() {
        configureAdaptiveSystemBackdrop()
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        @Suppress("DEPRECATION")
        val currentTask = manager.appTasks.firstOrNull { it.taskInfo.id == taskId }
        currentTask
            ?.setExcludeFromRecents(assistantOverlayActive)
    }

    private fun configureAdaptiveSystemBackdrop() {
        if (!assistantOverlayActive) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND or WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                window.setBackgroundBlurRadius(0)
                window.attributes = window.attributes.apply { blurBehindRadius = 0 }
            }
            window.setBackgroundDrawable(ColorDrawable(Color.rgb(2, 4, 5)))
            NexusSystemBars.apply(window)
            return
        }
        // Opaque cosmic backdrop keeps the Core readable over bright apps and wallpapers.
        window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND or WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.setBackgroundBlurRadius(0)
            window.attributes = window.attributes.apply { blurBehindRadius = 0 }
        }
        window.setBackgroundDrawable(ColorDrawable(Color.rgb(2, 4, 5)))
        window.decorView.setBackgroundColor(Color.rgb(2, 4, 5))
        NexusSystemBars.apply(window)
    }
}

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
        // Android dims the actual app underneath; the Core retains its own dark backdrop.
        // Dimming remains effective when cross-window blur is unavailable or disabled.
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        window.attributes = window.attributes.apply { dimAmount = .78f }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.setBackgroundBlurRadius(0)
            val blurEnabled = (getSystemService(Context.WINDOW_SERVICE) as WindowManager).isCrossWindowBlurEnabled
            if (blurEnabled) window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
            window.attributes = window.attributes.apply { blurBehindRadius = if (blurEnabled) 32 else 0 }
        }
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window.decorView.setBackgroundColor(Color.TRANSPARENT)
        NexusSystemBars.apply(window)
    }
}

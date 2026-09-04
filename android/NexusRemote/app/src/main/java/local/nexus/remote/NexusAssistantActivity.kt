package local.nexus.remote

import android.app.ActivityManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.WindowManager

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

    private fun configureAdaptiveSystemBackdrop() {
        window.decorView.setBackgroundColor(Color.TRANSPARENT)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val lowCostMode = activityManager.isLowRamDevice || powerManager.isPowerSaveMode
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !lowCostMode) {
            val density = resources.displayMetrics.density
            val blurRadius = (if (activityManager.memoryClass >= 256) 30f else 20f) * density
            window.setBackgroundBlurRadius((blurRadius * .42f).toInt())
            window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
            window.attributes = window.attributes.apply { blurBehindRadius = blurRadius.toInt() }
            window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        } else {
            window.setDimAmount(if (lowCostMode) .08f else .12f)
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        }
    }
}

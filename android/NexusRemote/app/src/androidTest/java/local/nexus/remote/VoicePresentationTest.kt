package local.nexus.remote

import android.content.Intent
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual Compose bounds and touch dispatch; no microphone, inference or personal storage. */
@RunWith(AndroidJUnit4::class)
class VoicePresentationTest {
    @Test fun downwardSwipeAndExpansionKeepTheSameSceneAndAlignedHitbox() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        check(context.packageName.endsWith(".qa"))
        ActivityScenario.launch<NexusMainActivity>(Intent(context, NexusMainActivity::class.java)).use { session ->
            val compact = mutableStateOf(false)
            val reduced = mutableStateOf(false)
            val origin = mutableStateOf(Offset.Zero)
            val scene = CosmicSceneState()
            val density = context.resources.displayMetrics.density
            val full = Rect(24f * density, 90f * density, 264f * density, 330f * density)
            val mini = Rect(24f * density, 350f * density, 88f * density, 414f * density)
            session.onActivity { activity ->
                activity.setContent {
                    CompositionLocalProvider(LocalCosmicScene provides scene) {
                        Box(Modifier.fillMaxSize().onGloballyPositioned { origin.value = it.positionInWindow() }) {
                            CosmicPresentationCore(if (compact.value) mini else full, origin.value,
                                "speaking", .43f, reduced.value,
                                onSwipeDown = { compact.value = true }, onClick = { compact.value = false })
                        }
                    }
                }
            }
            fun settle(expected: Rect) {
                val deadline = SystemClock.uptimeMillis() + 3000
                while (SystemClock.uptimeMillis() < deadline) {
                    instrumentation.waitForIdleSync()
                    var matches = false
                    instrumentation.runOnMainSync {
                        matches = kotlin.math.abs(scene.bounds.width - expected.width) < 2f &&
                            kotlin.math.abs(scene.bounds.top - expected.top) < 2f
                    }
                    if (matches) return
                    SystemClock.sleep(25)
                }
                fail("Core bounds did not reach the presentation target")
            }
            fun touch(from: Offset, to: Offset) {
                val down = SystemClock.uptimeMillis()
                fun send(action: Int, point: Offset) {
                    val event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, point.x, point.y, 0)
                    event.source = InputDevice.SOURCE_TOUCHSCREEN
                    try { assertTrue(instrumentation.uiAutomation.injectInputEvent(event, true)) }
                    finally { event.recycle() }
                }
                send(MotionEvent.ACTION_DOWN, from)
                if (from != to) repeat(12) { step ->
                    SystemClock.sleep(16)
                    send(MotionEvent.ACTION_MOVE, from + (to - from) * ((step + 1) / 12f))
                }
                send(MotionEvent.ACTION_UP, to)
            }
            for (reduce in listOf(false, true)) {
                instrumentation.runOnMainSync { reduced.value = reduce }
                repeat(3) {
                    settle(full)
                    touch(full.center, full.center + Offset(0f, 90f * density))
                    repeat(if (reduce) 1 else 12) {
                        SystemClock.sleep(25)
                        instrumentation.runOnMainSync {
                            assertTrue("Presentation must not dispose the scene", scene.present)
                            assertEquals("speaking", scene.state)
                            assertEquals(.43f, scene.energy)
                        }
                    }
                    settle(mini)
                    touch(mini.center, mini.center)
                    settle(full)
                }
            }
        }
    }
}

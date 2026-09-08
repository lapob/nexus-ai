package local.nexus.remote

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.RenderProcessGoneDetail
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/** One local-only GPU scene. No JavaScript bridge, remote page, or file access. */
internal class CosmicSceneState {
    var bounds by mutableStateOf(Rect.Zero)
    var state by mutableStateOf("idle")
    var energy by mutableFloatStateOf(0f)
    var reduced by mutableStateOf(false)
    var present by mutableStateOf(false)
    var inspection by mutableStateOf(listOf(0f, 0f, 0f))
}
internal val LocalCosmicScene = staticCompositionLocalOf { CosmicSceneState() }

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun CosmicScene(modifier: Modifier = Modifier) {
    val scene = LocalCosmicScene.current
    val density = LocalDensity.current.density
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var web by remember { mutableStateOf<WebView?>(null) }
    var origin by remember { mutableStateOf(Rect.Zero) }
    var loaded by remember { mutableStateOf(false) }
    var generation by remember { mutableIntStateOf(0) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> { web?.onResume(); web?.evaluateJavascript("window.nexusPaused=false;window.nexusVisualizer?.refresh()", null) }
                Lifecycle.Event.ON_STOP -> { web?.evaluateJavascript("window.nexusPaused=true", null); web?.onPause() }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); web?.stopLoading(); web?.destroy(); web = null }
    }
    key(generation) {
    AndroidView(modifier = modifier.onGloballyPositioned { origin = it.boundsInWindow() }, factory = { context ->
        WebView(context).apply {
            web = this
            setBackgroundColor(AndroidColor.TRANSPARENT)
            importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            isFocusable = false
            setOnTouchListener { _, _ -> true }
            settings.apply {
                javaScriptEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                blockNetworkLoads = true
                domStorageEnabled = false
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportMultipleWindows(false)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(ByteArray(0)))
                override fun onPageFinished(view: WebView?, url: String?) { loaded = true }
                override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                    (view?.parent as? android.view.ViewGroup)?.removeView(view)
                    view?.destroy()
                    if (web === view) web = null
                    loaded = false
                    generation += 1
                    return true
                }
            }
            val html = context.assets.open("cosmic-visualizers.html").bufferedReader().use { it.readText() }
            loadDataWithBaseURL("https://visualizer.nexus.invalid/", html, "text/html", "UTF-8", null)
        }
    })
    }
    val current by rememberUpdatedState(scene)
    val currentOrigin by rememberUpdatedState(origin)
    LaunchedEffect(loaded, density) {
        if (!loaded) return@LaunchedEffect
        var previous = ""
        while (true) {
            val s = current; val b = s.bounds; val o = currentOrigin
            val data = JSONObject().put("state", s.state).put("energy", if (s.energy.isFinite()) s.energy.coerceIn(0f, 1f) else 0f)
                .put("reduced", s.reduced).put("visible", s.present)
                .put("inspection", JSONArray(s.inspection))
                .put("bounds", JSONArray(listOf((b.left-o.left)/density, (b.top-o.top)/density, b.width/density, b.height/density))).toString()
            if (data != previous && lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                web?.evaluateJavascript("window.updateNexusVisual && window.updateNexusVisual($data)", null)
                previous = data
            }
            kotlinx.coroutines.delay(66)
        }
    }
}

@Composable
internal fun CosmicCore(diameter: Dp, state: String, energy: Float, reduceMotion: Boolean, onClick: () -> Unit) {
    val scene = LocalCosmicScene.current
    SideEffect { scene.state = state; scene.energy = energy; scene.reduced = reduceMotion }
    DisposableEffect(scene) { scene.present = true; onDispose { scene.present = false } }
    Box(Modifier.size(diameter).onGloballyPositioned { scene.bounds = it.boundsInWindow() }
        .pointerInput(reduceMotion) { if (!reduceMotion) detectDragGestures(
            onDragEnd = { scene.inspection = listOf(0f, 0f, 0f) },
            onDragCancel = { scene.inspection = listOf(0f, 0f, 0f) },
            onDrag = { change, _ -> change.consume(); scene.inspection = listOf(change.position.x / size.width * 2f - 1f, change.position.y / size.height * 2f - 1f, 1f) }
        ) }
        .semantics { contentDescription = "NexusNXS Core" }.clickable(onClick = onClick))
}

@Composable
internal fun CosmicStandaloneCore(diameter: Dp, state: String, energy: Float, reduceMotion: Boolean, onClick: () -> Unit) {
    val scene = remember { CosmicSceneState() }
    CompositionLocalProvider(LocalCosmicScene provides scene) {
        Box(Modifier.size(diameter)) {
            CosmicScene(Modifier.fillMaxSize())
            CosmicCore(diameter, state, energy, reduceMotion, onClick)
        }
    }
}

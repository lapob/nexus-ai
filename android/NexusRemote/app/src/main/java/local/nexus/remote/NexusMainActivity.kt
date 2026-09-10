package local.nexus.remote

import local.nexus.motion.NexusMotion
import local.nexus.motion.NexusSystemBars
import local.nexus.motion.NexusInteractionStates

import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.KeyguardManager
import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.hardware.display.DisplayManager
import android.view.Display
import android.animation.ValueAnimator
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.outlined.CallSplit
import androidx.compose.material.icons.automirrored.outlined.EventNote
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.collect
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import java.util.Locale
import kotlin.math.sin
import kotlin.math.cos

@Composable
private fun nexusCopy(italian: String, english: String): String =
    if (LocalConfiguration.current.locales[0].language == Locale.ITALIAN.language) italian else english

private fun Context.nexusCopy(italian: String, english: String): String =
    if (resources.configuration.locales[0].language == Locale.ITALIAN.language) italian else english

/** Variante non-Compose per comandi e persistenza, coerente con la lingua del dispositivo. */
private fun slashCopy(italian: String, english: String): String =
    if (Locale.getDefault().language == Locale.ITALIAN.language) italian else english

private fun spokenLocale(text: String, fallback: Locale): Locale {
    val sample = " ${text.lowercase(Locale.ROOT)} "
    val candidates = listOf(
        Locale.ITALIAN to Regex("\\b(che|chi|come|cosa|questo|questa|sono|puoi|deve|della|perché|anche|risposta|ecco)\\b|[àèéìòù]"),
        Locale("es", "ES") to Regex("\\b(que|cómo|qué|esto|esta|puedes|para|porque|respuesta|también)\\b|[áéíóúñ¿¡]"),
        Locale.FRENCH to Regex("\\b(que|comment|quoi|ceci|vous|pour|parce|réponse|aussi)\\b|[àâçéèêëîïôûùüÿœ]"),
        Locale.GERMAN to Regex("\\b(und|der|die|das|wie|was|kann|für|weil|antwort|auch)\\b|[äöüß]"),
        Locale.ENGLISH to Regex("\\b(the|and|how|what|this|that|you|can|because|answer|also)\\b")
    )
    val best = candidates.map { (locale, pattern) -> locale to pattern.findAll(sample).count() }.maxByOrNull { it.second }
    return if (best != null && best.second >= 2) best.first else fallback
}

/** Traduce le fasi pubbliche del Core senza affidare al modello la lingua UI. */
private fun Context.localizedServerActivity(raw: String): String {
    val text = raw.trim()
    if (resources.configuration.locales[0].language == Locale.ITALIAN.language) return text
    Regex("^In attesa\\s*[·-]\\s*posizione\\s+(\\d+)$", RegexOption.IGNORE_CASE)
        .matchEntire(text)?.let { return "Waiting · position ${it.groupValues[1]}" }
    return when (text) {
        "Comprendo la richiesta…" -> "Understanding the request…"
        "Comprendo la richiesta e preparo il contesto…" -> "Understanding the request and preparing context…"
        "Raccolgo le informazioni utili…" -> "Gathering useful information…"
        "Preparo l’intelligenza più adatta…" -> "Preparing the best approach…"
        "Ragiono e collego i dettagli…" -> "Reasoning through the details…"
        "Formulo la risposta…" -> "Preparing the response…"
        "Genero la risposta…" -> "Generating the response…"
        "Verifico accuratezza, sicurezza e lingua…" -> "Checking accuracy, safety, and language…"
        "Organizzo e controllo la risposta…" -> "Organizing and checking the response…"
        "Risposta pronta" -> "Response ready"
        "Non sono riuscito a completare la risposta" -> "The response could not be completed"
        else -> text
    }
}

private fun Context.copyToClipboard(value: String) {
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("NexusNXS", value))
}

@Composable private fun nexusIsItalian(): Boolean = LocalConfiguration.current.locales[0].language == Locale.ITALIAN.language

private val Ink = Color(0xFF020405)
private val Surface = Color(0xFF121718)
private val Surface2 = Color(0xFF242B2C)
private val Ice = Color(0xFFF7FBFB)
private val Mist = Color(0xFFABBABB)
private val Cyan = Color(0xFF4BE7E9)
private val Hairline = Color(0xFF5B696A)
private val NexusSans = FontFamily(
    androidx.compose.ui.text.font.Font(R.font.inter_variable, FontWeight.Normal),
    androidx.compose.ui.text.font.Font(R.font.inter_variable, FontWeight.Medium),
    androidx.compose.ui.text.font.Font(R.font.inter_variable, FontWeight.SemiBold),
    androidx.compose.ui.text.font.Font(R.font.inter_variable, FontWeight.Bold)
)
private val NexusSheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
private const val NEXUS_ACTIVITY_CHANNEL = "nexus_private_activity"

/** Un solo linguaggio di movimento: rapido, fisico e coerente in tutta NexusNXS. */
private object NexusFlow {
    val ENTER = NexusMotion.ENTER
    val EXIT = NexusMotion.EXIT
    val QUICK = NexusMotion.QUICK
    val FADE_DELAY = NexusMotion.FADE_DELAY
    val REDUCED = NexusMotion.REDUCED
    val THINKING_PULSE = NexusMotion.THINKING_PULSE
    val CURSOR_PULSE = NexusMotion.CURSOR_PULSE
    val STREAM_FADE = NexusMotion.STREAM_FADE
    val COMPOSER_RESIZE = NexusMotion.COMPOSER_RESIZE
    val VOICE_WAVE = NexusMotion.VOICE_WAVE
    val SKELETON_PULSE = NexusMotion.SKELETON_PULSE
    val PARTICLE_BUDGET = NexusMotion.PARTICLE_BUDGET
    val PARTICLE_TICK = NexusMotion.PARTICLE_TICK
    val emphasized = CubicBezierEasing(NexusMotion.EMPHASIZED_X1, NexusMotion.EMPHASIZED_Y1, NexusMotion.EMPHASIZED_X2, NexusMotion.EMPHASIZED_Y2)
    val standard = CubicBezierEasing(NexusMotion.STANDARD_X1, NexusMotion.STANDARD_Y1, NexusMotion.STANDARD_X2, NexusMotion.STANDARD_Y2)
}

/**
 * Non crea un clock infinito quando il movimento e ridotto o disattivato dal
 * sistema. Usare un tween da 1 ms continuava infatti a ricomporre la UI anche
 * quando il risultato disegnato era statico, con consumo e frame persi inutili.
 */
@Composable
private fun nexusLoopFloat(
    enabled: Boolean,
    initialValue: Float,
    targetValue: Float,
    durationMillis: Int,
    repeatMode: RepeatMode,
    label: String,
    disabledValue: Float = initialValue,
    linear: Boolean = false
): Float {
    if (!enabled) return disabledValue
    val transition = rememberInfiniteTransition(label = label)
    val value by transition.animateFloat(
        initialValue = initialValue,
        targetValue = targetValue,
        animationSpec = infiniteRepeatable(
            tween(durationMillis, easing = if (linear) LinearEasing else NexusFlow.standard),
            repeatMode = repeatMode
        ),
        label = label
    )
    return value
}

/** Firma percettiva comune a ogni comparsa, scomparsa e sostituzione di superficie. */
private fun nexusEnter(reduced: Boolean = false) =
    fadeIn(tween(if (reduced) NexusFlow.REDUCED else NexusFlow.ENTER, delayMillis = if (reduced) 0 else NexusFlow.FADE_DELAY, easing = NexusFlow.standard))

private fun nexusExit(reduced: Boolean = false) =
    fadeOut(tween(if (reduced) NexusFlow.REDUCED else NexusFlow.EXIT, easing = NexusFlow.standard))

private fun nexusTransform(reduced: Boolean = false) =
    ContentTransform(nexusEnter(reduced), nexusExit(reduced), sizeTransform = SizeTransform(clip = false) { _, _ ->
        tween(if (reduced) NexusFlow.REDUCED else NexusFlow.COMPOSER_RESIZE, easing = NexusFlow.emphasized)
    })

/** Android owns IME movement; the composer only cross-fades, without a second resize spring. */
private fun nexusComposerTransform(reduced: Boolean = false) =
    ContentTransform(nexusEnter(reduced), nexusExit(reduced), sizeTransform = null)

/**
 * Navigazione Android completa: avanzamento da destra e ritorno speculare.
 * La distanza rimane breve per sostenere 60 Hz, mentre Android conserva il
 * controllo globale tramite la propria scala animazioni e Riduci animazioni.
 */
private fun nexusScreenTransform(back: Boolean, reduced: Boolean = false): ContentTransform {
    if (reduced) return nexusTransform(true)
    val enterOffset: (Int) -> Int = { width -> if (back) -width / 9 else width / 9 }
    val exitOffset: (Int) -> Int = { width -> if (back) width / 12 else -width / 12 }
    return ContentTransform(
        fadeIn(tween(NexusFlow.ENTER, delayMillis = NexusFlow.FADE_DELAY, easing = NexusFlow.standard)) +
            slideInHorizontally(tween(NexusFlow.ENTER, easing = NexusFlow.emphasized), initialOffsetX = enterOffset),
        fadeOut(tween(NexusFlow.EXIT, easing = NexusFlow.standard)) +
            slideOutHorizontally(tween(NexusFlow.EXIT, easing = NexusFlow.standard), targetOffsetX = exitOffset),
        sizeTransform = SizeTransform(clip = false)
    )
}

private enum class NexusWidthClass { COMPACT, MEDIUM, EXPANDED }
@Immutable
private data class NexusMetrics(
    val widthClass: NexusWidthClass,
    val landscape: Boolean,
    val fontScale: Float,
    val contentMaxWidth: androidx.compose.ui.unit.Dp,
    val horizontalPadding: androidx.compose.ui.unit.Dp,
    val topBarHeight: androidx.compose.ui.unit.Dp,
    val drawerWidth: androidx.compose.ui.unit.Dp,
    val particleBudget: Int,
    val adaptiveReducedMotion: Boolean
)
private val LocalNexusMetrics = staticCompositionLocalOf { NexusMetrics(NexusWidthClass.COMPACT, false, 1f, 680.dp, 16.dp, 64.dp, 340.dp, 64, false) }
private val NEXUS_COSMIC_CONTINUUM_ID = NexusInteractionStates.CONTINUUM_ID

@Composable private fun rememberNexusMetrics(): NexusMetrics {
    val context = LocalContext.current
    val density = LocalDensity.current
    val windowSize = LocalWindowInfo.current.containerSize
    val fontScale = density.fontScale
    val display = (context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager)?.getDisplay(Display.DEFAULT_DISPLAY)
    val refreshRate = display?.supportedModes?.maxOfOrNull { it.refreshRate } ?: display?.refreshRate ?: 60f
    val health = context.getSharedPreferences("nexus_compose", Context.MODE_PRIVATE)
    val slowRatio by produceState(initialValue = health.getFloat("frameHealth.recentSlowRatio", 0f), health) {
        while (true) {
            value = health.getFloat("frameHealth.recentSlowRatio", 0f)
            kotlinx.coroutines.delay(2_000)
        }
    }
    val frameConstrained by produceState(initialValue = health.getBoolean("frameHealth.constrained", false), health) {
        while (true) {
            value = health.getBoolean("frameHealth.constrained", false)
            kotlinx.coroutines.delay(2_000)
        }
    }
    val frameScale = when { frameConstrained -> .52f; slowRatio >= .06f -> .72f; else -> 1f }
    val width = with(density) { windowSize.width.toDp().value.toInt() }
    val landscape = windowSize.width > windowSize.height
    val widthClass = when { width < 600 -> NexusWidthClass.COMPACT; width < 840 -> NexusWidthClass.MEDIUM; else -> NexusWidthClass.EXPANDED }
    return remember(width, landscape, fontScale, refreshRate, frameScale) {
        NexusMetrics(
            widthClass = widthClass,
            landscape = landscape,
            fontScale = fontScale,
            contentMaxWidth = when (widthClass) { NexusWidthClass.COMPACT -> 680.dp; NexusWidthClass.MEDIUM -> 760.dp; NexusWidthClass.EXPANDED -> 840.dp },
            horizontalPadding = when { width < 360 -> 10.dp; widthClass == NexusWidthClass.COMPACT -> 14.dp; else -> 20.dp },
            topBarHeight = if (fontScale > 1.2f) 72.dp else 64.dp,
            drawerWidth = when (widthClass) { NexusWidthClass.COMPACT -> (width * .86f).coerceAtMost(360f).dp; NexusWidthClass.MEDIUM -> 380.dp; NexusWidthClass.EXPANDED -> 420.dp },
            particleBudget = (when (widthClass) { NexusWidthClass.COMPACT -> 64; NexusWidthClass.MEDIUM -> 82; NexusWidthClass.EXPANDED -> 104 } * (if (refreshRate >= 90f) 1f else .78f) * frameScale).toInt().coerceAtLeast(28),
            adaptiveReducedMotion = frameConstrained || slowRatio >= .16f
        )
    }
}

enum class NexusScreen { CHAT, LIBRARY, PROJECTS, ACTIVITY, REMOTE, SCHEDULED, SETTINGS }
enum class NexusPresence { IDLE, LISTENING, THINKING, RESPONDING, EXECUTING, CONNECTING, OFFLINE, ERROR }
enum class NexusConnection { CHECKING, ONLINE, OFFLINE }
private enum class NexusVoiceMode { IDLE, SINGLE_TURN, HANDS_FREE }
private enum class NexusAuthorizationKind { NONE, WORK, WAKE }
@Immutable data class ChatRow(val id: String, val title: String, val preview: String, val updatedAt: Long, val pinned: Boolean = false)
@Immutable data class DeviceRow(val id: String, val name: String, val scope: String, val lastSeenAt: Long, val current: Boolean)
@Immutable data class WakeTargetRow(val id: String, val label: String)
@Immutable data class WorkArtifact(val title: String, val subtitle: String, val language: String, val content: String, val added: Int, val removed: Int)
@Immutable data class Turn(val role: String, val content: String, val artifacts: List<WorkArtifact> = emptyList())
@Immutable data class ModelRow(val id: String, val name: String, val size: Long = 0L, val available: Boolean = true)
@Immutable data class SlashCommandRow(val name: String, val label: String, val description: String, val template: String, val custom: Boolean = false)
private data class SlashResolution(val text: String = "", val handled: Boolean = false, val message: String = "", val commands: List<SlashCommandRow>? = null)

private fun builtinSlashCommands() = listOf(
    SlashCommandRow("web", slashCopy("Ricerca web", "Web search"), slashCopy("Informazioni aggiornate con fonti", "Current information with sources"), "Cerca sul web informazioni aggiornate e cita fonti affidabili: {testo}"),
    SlashCommandRow("ragiona", slashCopy("Ragionamento profondo", "Deep reasoning"), slashCopy("Analizza e verifica i passaggi", "Analyze and verify each step"), "Analizza in modo approfondito, verifica i passaggi importanti e proponi la soluzione migliore: {testo}"),
    SlashCommandRow("immagine", slashCopy("Genera immagine", "Generate image"), slashCopy("Crea un’immagine dalla descrizione", "Create an image from the description"), "Genera un’immagine di alta qualità seguendo questa descrizione: {testo}"),
    SlashCommandRow("riassumi", slashCopy("Riassumi", "Summarize"), slashCopy("Riduce ai punti essenziali", "Reduce to the essential points"), "Riassumi in modo chiaro, fedele e ben strutturato: {testo}"),
    SlashCommandRow("traduci", slashCopy("Traduci", "Translate"), slashCopy("Traduzione naturale e fedele", "Natural and faithful translation"), "Traduci il seguente contenuto nella lingua che indico, conservando tono e significato: {testo}"),
    SlashCommandRow("codice", slashCopy("Scrivi o correggi codice", "Write or fix code"), slashCopy("Codice completo e verificabile", "Complete, verifiable code"), "Affronta questa richiesta di programmazione. Fornisci codice completo, controlli e istruzioni d’uso: {testo}"),
    SlashCommandRow("nuovo", slashCopy("Nuovo comando", "New command"), "/nuovo brief = Riassumi in 5 punti {testo}", ""),
    SlashCommandRow("rimuovi", slashCopy("Rimuovi comando", "Remove command"), "/rimuovi brief", "")
)
private data class WakeRelayDescriptor(val endpoint: String, val pairing: Boolean)
private class NexusHttpException(val statusCode: Int, message: String) : IllegalStateException(message)
@Immutable data class NexusUiState(
    val screen: NexusScreen = NexusScreen.CHAT,
    val work: Boolean = false,
    val drawer: Boolean = false,
    val modelSheet: Boolean = false,
    val model: String = "NexusNXS Rapido",
    val models: List<ModelRow> = listOf(ModelRow("nexus-fast", "NexusNXS Rapido"), ModelRow("nexus-deep", "NexusNXS Pro")),
    val conversationId: String = "",
    val chats: List<ChatRow> = emptyList(),
    val chatQuery: String = "",
    val conversationSearchOpen: Boolean = false,
    val conversationSearch: String = "",
    val turns: List<Turn> = emptyList(),
    val draft: String = "",
    val attachment: String? = null,
    val attachmentUri: String = "",
    val attachmentMime: String = "",
    val attachmentData: String = "",
    val busy: Boolean = false,
    val streaming: String = "",
    val speechPlayback: String = "idle",
    val activity: String = "",
    val error: String? = null,
    val status: String = "Riconnessione automatica",
    val connection: NexusConnection = NexusConnection.CHECKING,
    val pairing: Boolean = false,
    val temporary: Boolean = false,
    val devices: List<DeviceRow> = emptyList(),
    val profileUri: String = "",
    val reduceMotion: Boolean = false,
    val pendingCount: Int = 0,
    val workTicketId: String = "",
    val workPreview: String = "",
    val workRisk: String = "",
    val diagnosticsOpen: Boolean = false,
    val privacyMode: Boolean = false,
    val hapticsEnabled: Boolean = true,
    val remoteWorkAvailable: Boolean = false,
    val pairingAvailable: Boolean = false,
    val capabilitiesChecked: Boolean = false,
    val wakePairingAvailable: Boolean = false,
    val wakeAvailable: Boolean = false,
    val wakeConnected: Boolean = false,
    val wakeTargets: List<WakeTargetRow> = emptyList(),
    val wakeSelectedTarget: String = "",
    val wakeTicketId: String = "",
    val wakePreview: String = "",
    val wakeRisk: String = "",
    val wakeStatus: String = "",
    val wakeBusy: Boolean = false,
    val wakeAwaiting: Boolean = false,
    val assistantInvocation: Long = 0L,
    val assistantOverlay: Boolean = false,
    val assistantEntry: String = "",
    val slashCommands: List<SlashCommandRow> = emptyList()
)

/**
 * Chrome e composer ricevono soltanto lo stato che disegnano. Durante lo
 * streaming il testo cambia a ogni frame, ma barra superiore e campo di input
 * restano quindi skippabili dal runtime Compose invece di essere ricostruiti.
 */
@Immutable
private data class NexusTopBarState(
    val active: Boolean,
    val temporary: Boolean,
    val temporaryHasContent: Boolean,
    val headerTitle: String,
    val pinned: Boolean,
    val conversationId: String,
    val work: Boolean,
    val remoteWorkAvailable: Boolean,
    val pairingAvailable: Boolean,
    val hapticsEnabled: Boolean,
    val reduceMotion: Boolean
)

private fun NexusUiState.topBarState() = NexusTopBarState(
    active = turns.isNotEmpty() || busy || temporary,
    temporary = temporary,
    temporaryHasContent = draft.isNotBlank() || turns.isNotEmpty() || attachment != null,
    headerTitle = chats.firstOrNull { it.id == conversationId }?.title.orEmpty(),
    pinned = chats.firstOrNull { it.id == conversationId }?.pinned == true,
    conversationId = conversationId,
    work = work,
    remoteWorkAvailable = remoteWorkAvailable,
    pairingAvailable = pairingAvailable,
    hapticsEnabled = hapticsEnabled,
    reduceMotion = reduceMotion
)

@Immutable
private data class NexusComposerState(
    val work: Boolean,
    val temporary: Boolean,
    val draft: String,
    val attachment: String?,
    val attachmentUri: String,
    val attachmentMime: String,
    val attachmentData: String,
    val busy: Boolean,
    val connection: NexusConnection,
    val pendingCount: Int,
    val model: String,
    val remoteWorkAvailable: Boolean,
    val reduceMotion: Boolean,
    val hapticsEnabled: Boolean,
    val slashCommands: List<SlashCommandRow>
)

private fun NexusUiState.composerState() = NexusComposerState(
    work = work,
    temporary = temporary,
    draft = draft,
    attachment = attachment,
    attachmentUri = attachmentUri,
    attachmentMime = attachmentMime,
    attachmentData = attachmentData,
    busy = busy,
    connection = connection,
    pendingCount = pendingCount,
    model = model,
    remoteWorkAvailable = remoteWorkAvailable,
    reduceMotion = reduceMotion,
    hapticsEnabled = hapticsEnabled,
    slashCommands = slashCommands
)

private fun NexusUiState.presence(): NexusPresence = when {
    connection == NexusConnection.OFFLINE || error?.isTransportFailure() == true -> NexusPresence.OFFLINE
    error != null -> NexusPresence.ERROR
    busy && work -> NexusPresence.EXECUTING
    busy && streaming.isNotBlank() -> NexusPresence.RESPONDING
    busy -> NexusPresence.THINKING
    connection == NexusConnection.CHECKING -> NexusPresence.CONNECTING
    else -> NexusPresence.IDLE
}

/**
 * Conta soltanto elementi operativi gia presenti nello stato locale. Nessuna
 * sorgente aggiuntiva e nessun endpoint vengono interrogati dalla Inbox.
 */
private fun NexusUiState.attentionCount(): Int {
    var count = pendingCount.coerceAtLeast(0)
    if (connection == NexusConnection.OFFLINE) count++
    if (busy) count++
    if (workTicketId.isNotBlank()) count++
    if (wakeTicketId.isNotBlank()) count++
    if (error?.isTransportFailure() == false) count++
    return count.coerceAtMost(99)
}

@Composable private fun NexusPresence.label() = when (this) {
    NexusPresence.IDLE -> nexusCopy("Pronto", "Ready")
    NexusPresence.LISTENING -> nexusCopy("In ascolto", "Listening")
    NexusPresence.THINKING -> nexusCopy("Comprensione", "Understanding")
    NexusPresence.RESPONDING -> nexusCopy("Risposta", "Responding")
    NexusPresence.EXECUTING -> nexusCopy("Cuore in azione", "Core in progress")
    NexusPresence.CONNECTING -> nexusCopy("Connessione ai server NexusNXS", "Connecting to NexusNXS servers")
    NexusPresence.OFFLINE -> nexusCopy("Offline · riconnessione automatica", "Offline · automatic reconnection")
    NexusPresence.ERROR -> nexusCopy("Richiede attenzione", "Needs attention")
}

private fun String.isTransportFailure(): Boolean =
    contains("non è raggiungibile", ignoreCase = true) ||
        contains("non raggiungibile", ignoreCase = true) ||
        contains("connessione interrotta", ignoreCase = true) ||
        contains("trasferimento non riuscito", ignoreCase = true) ||
        contains("not reachable", ignoreCase = true) ||
        contains("connection interrupted", ignoreCase = true) ||
        contains("transfer failed", ignoreCase = true)

open class NexusMainActivity : ComponentActivity() {
    companion object {
        private const val SESSION_RESUME_WINDOW_MS = 30L * 60L * 1000L
        private const val MAX_ATTACHMENT_BYTES = 1_500_000
        private const val MAX_BACKUP_BYTES = 16 * 1024 * 1024
        private const val WAKE_RELAY_PROTOCOL_VERSION = 1
        private const val WAKE_TOKEN_ROTATION_MS = 24L * 60L * 60L * 1000L
    }
    private lateinit var store: LocalChatStore
    private lateinit var secureTokens: SecureTokenStore
    private var state by mutableStateOf(NexusUiState())
    protected val assistantOverlayActive: Boolean get() = state.assistantOverlay
    protected open fun onAssistantPresentationChanged() = Unit
    private var temporaryReturnConversationId = ""
    private var temporaryReturnDraft = ""
    private var temporaryReturnWork = false
    private var pendingAuthorizationTicket = ""
    private var pendingAuthorizationKind = NexusAuthorizationKind.NONE
    private var deviceCredentialInProgress = false
    private val prefs by lazy { getSharedPreferences("nexus_compose", MODE_PRIVATE) }
    private val uiHandler = Handler(Looper.getMainLooper())
    private var pendingDraftConversationId = ""
    private var pendingDraftValue = ""
    private val persistDraftRunnable = Runnable {
        val id = pendingDraftConversationId
        val value = pendingDraftValue
        pendingDraftConversationId = ""
        pendingDraftValue = ""
        if (id.isNotBlank()) prefs.edit { putString("draft:$id", value) }
    }

    private fun queueDraftPersistence(conversationId: String, value: String) {
        if (conversationId.isBlank()) return
        pendingDraftConversationId = conversationId
        pendingDraftValue = value
        uiHandler.removeCallbacks(persistDraftRunnable)
        uiHandler.postDelayed(persistDraftRunnable, 220L)
    }

    private fun flushDraftPersistence() {
        if (pendingDraftConversationId.isBlank()) return
        uiHandler.removeCallbacks(persistDraftRunnable)
        persistDraftRunnable.run()
    }

    private fun discardDraftPersistence(conversationId: String) {
        if (pendingDraftConversationId == conversationId) {
            uiHandler.removeCallbacks(persistDraftRunnable)
            pendingDraftConversationId = ""
            pendingDraftValue = ""
        }
        if (conversationId.isNotBlank()) prefs.edit { remove("draft:$conversationId") }
    }

    private data class StreamUiUpdate(
        val conversationId: String,
        val temporary: Boolean,
        val generation: Long,
        val text: String
    )

    private val pendingStreamUpdate = AtomicReference<StreamUiUpdate?>(null)
    private val streamUiScheduled = AtomicBoolean(false)
    private val streamUiDrain = object : Runnable {
        override fun run() {
            streamUiScheduled.set(false)
            val update = pendingStreamUpdate.getAndSet(null) ?: return
            if (!destroyed && state.busy && streamMatchesUi(update.conversationId, update.temporary, update.generation)) {
                state = state.copy(streaming = update.text)
            }
            if (pendingStreamUpdate.get() != null && streamUiScheduled.compareAndSet(false, true)) {
                uiHandler.post(this)
            }
        }
    }

    /** Mantiene al massimo un aggiornamento streaming in coda sul main thread. */
    private fun publishStreamUi(conversationId: String, temporary: Boolean, generation: Long, text: String) {
        pendingStreamUpdate.set(StreamUiUpdate(conversationId, temporary, generation, text))
        if (streamUiScheduled.compareAndSet(false, true)) uiHandler.post(streamUiDrain)
    }

    private fun clearPendingStreamUi() {
        pendingStreamUpdate.set(null)
        streamUiScheduled.set(false)
        uiHandler.removeCallbacks(streamUiDrain)
    }
    private fun normalizeHttpsEndpoint(value: String): String? = runCatching {
        val parsed = java.net.URI(value.trim())
        require(parsed.scheme.equals("https", ignoreCase = true))
        require(!parsed.host.isNullOrBlank() && parsed.rawUserInfo == null && parsed.rawQuery == null && parsed.rawFragment == null)
        require(parsed.rawPath.isNullOrEmpty() || parsed.rawPath == "/")
        require(parsed.port == -1 || parsed.port in 1..65535)
        val host = parsed.host.lowercase(Locale.ROOT).let { if (':' in it) "[$it]" else it }
        val authority = if (parsed.port == -1 || parsed.port == 443) host else "$host:${parsed.port}"
        "https://$authority"
    }.getOrNull()
    private fun configuredEndpoints(): List<String> =
        listOf(BuildConfig.NEXUS_URL, BuildConfig.NEXUS_FALLBACK_URL, BuildConfig.NEXUS_LAN_URL)
            .mapNotNull(::normalizeHttpsEndpoint).distinct()
    private fun trustedEndpoint(value: String): String? =
        normalizeHttpsEndpoint(value)?.takeIf { it in configuredEndpoints() }
    /**
     * Il relay di accensione non e un endpoint pubblico configurabile a mano.
     * Accettiamo soltanto un origin HTTPS Tailscale Serve, senza percorso,
     * credenziali, query o porte alternative, pubblicato dallo status autenticato.
     */
    private fun trustedWakeRelayEndpoint(value: String): String? = runCatching {
        val parsed = java.net.URI(value.trim())
        require(parsed.scheme.equals("https", ignoreCase = true))
        require(parsed.rawUserInfo == null && parsed.rawQuery == null && parsed.rawFragment == null)
        require(parsed.rawPath.isNullOrEmpty() || parsed.rawPath == "/")
        require(parsed.port == -1 || parsed.port == 443)
        val host = parsed.host?.lowercase(Locale.ROOT).orEmpty()
        val labels = host.split('.')
        require(host.length in 8..253 && host.endsWith(".ts.net") && labels.all { it.length in 1..63 && it.matches(Regex("[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")) })
        "https://$host"
    }.getOrNull()
    private val server get() = trustedEndpoint(prefs.getString("preferredServer", "").orEmpty())
        ?: trustedEndpoint(BuildConfig.NEXUS_URL).orEmpty()
    private val wakeRelayEndpoint get() = trustedWakeRelayEndpoint(secureTokens.read("wakeRelayEndpoint")).orEmpty()
    @Volatile private var reachableEndpoint = ""
    private fun endpointCandidates(): List<String> =
        listOf(reachableEndpoint, server, BuildConfig.NEXUS_URL, BuildConfig.NEXUS_FALLBACK_URL, BuildConfig.NEXUS_LAN_URL)
            .mapNotNull(::trustedEndpoint).distinct()
    private fun rememberReachable(endpoint: String) {
        trustedEndpoint(endpoint)?.let {
            reachableEndpoint = it
            prefs.edit { putString("preferredServer", it) }
        }
    }
    @Volatile private var activeConnection: HttpURLConnection? = null
    @Volatile private var activeWorkConnection: HttpURLConnection? = null
    @Volatile private var activeWorkOperationId = ""
    @Volatile private var activeWorkToken = ""
    @Volatile private var workCancellationRequested = false
    private val backgroundExecutor = Executors.newFixedThreadPool(6)
    private val cancellationExecutor = Executors.newSingleThreadExecutor()
    private val activeConnections = ConcurrentHashMap.newKeySet<HttpURLConnection>()
    @Volatile private var destroyed = false
    @Volatile private var retryingPending = false
    @Volatile private var connectionProbeRunning = false
    @Volatile private var capabilityProbeRunning = false
    @Volatile private var capabilityProbeCompleted = false
    @Volatile private var wakeProbeRunning = false
    @Volatile private var chatGeneration = 0L
    private var textToSpeech: TextToSpeech? = null
    @Volatile private var speechConnection: HttpURLConnection? = null
    @Volatile private var speechGeneration = 0L
    private var speechUtterance = ""
    private var neuralSpeechPlayer: MediaPlayer? = null
    private var neuralSpeechFile: File? = null
    private var speakNextAnswer = false
    private lateinit var frameHealth: FrameHealthMonitor
    @Volatile private var appVisible = false
    private fun runTask(block: () -> Unit) {
        if (destroyed || backgroundExecutor.isShutdown) return
        try {
            backgroundExecutor.execute {
                if (!destroyed && !Thread.currentThread().isInterrupted) block()
            }
        } catch (_: RejectedExecutionException) {
            // La chiusura dell'activity ha precedenza su un callback di rete tardivo.
        }
    }
    private fun postUi(block: () -> Unit) {
        if (destroyed) return
        runOnUiThread { if (!destroyed) block() }
    }
    private fun openTrackedConnection(value: String): HttpURLConnection =
        (URL(value).openConnection() as HttpURLConnection).also(activeConnections::add)
    private fun closeTrackedConnection(connection: HttpURLConnection) {
        activeConnections.remove(connection)
        connection.disconnect()
    }
    private fun probeStatus(base: String, path: String): Int {
        val connection = openTrackedConnection(base.trimEnd('/') + path)
        return try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 1_800
            connection.readTimeout = 1_800
            connection.requestMethod = "GET"
            connection.responseCode
        } finally { closeTrackedConnection(connection) }
    }
    private fun probeReady(base: String): Boolean {
        val readiness = probeStatus(base, "/readyz")
        // Compatibilità con gateway precedenti: un 503 significa non pronto e
        // non deve essere trasformato in Online dal solo endpoint di liveness.
        return readiness in 200..299 || readiness == 404 && probeStatus(base, "/healthz") in 200..299
    }
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            // Il debounce naturale di retryingPending impedisce invii doppi quando
            // Android segnala insieme Wi-Fi, VPN e rete mobile.
            probeConnection()
            if (::secureTokens.isInitialized) loadWakeCapabilities()
        }
        override fun onLost(network: Network) {
            if (hasValidatedInternet()) probeConnection() else postUi {
                val pending = store.pendingCount()
                if (!state.temporary) state = state.copy(
                    connection = NexusConnection.OFFLINE,
                    status = if (pending > 0) "Server NexusNXS non raggiungibili · $pending in coda" else "Server NexusNXS non raggiungibili",
                    pendingCount = pending
                )
            }
        }
    }

    private fun hasValidatedInternet(): Boolean {
        val connectivity = getSystemService(ConnectivityManager::class.java)
        val network = connectivity.activeNetwork ?: return false
        val capabilities = connectivity.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
    private fun readBoundedContent(uri: Uri, limit: Int): ByteArray {
        require(uri.scheme.equals("content", ignoreCase = true)) { "Sono ammessi soltanto contenuti Android autorizzati." }
        return contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream(minOf(limit, 64 * 1024))
            val buffer = ByteArray(8 * 1024)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count == 0) continue
                total += count
                require(total <= limit) { "Il contenuto supera il limite consentito." }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("Contenuto non disponibile")
    }
    private val backupExporter = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri -> uri?.let { runCatching { contentResolver.openOutputStream(it)?.bufferedWriter()?.use { writer -> writer.write(store.exportEncryptedArchive()) } }.onFailure { state = state.copy(error = nexusCopy("Esportazione non riuscita.", "Export failed.")) } } }
    private val backupImporter = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { runCatching { val archive = String(readBoundedContent(it, MAX_BACKUP_BYTES), StandardCharsets.UTF_8); store.importEncryptedArchive(archive) }.onSuccess { count -> refreshChats(true); state = state.copy(activity = nexusCopy("$count conversazioni ripristinate", "$count conversations restored")) }.onFailure { state = state.copy(error = nexusCopy("Questo backup non è valido o appartiene a un altro dispositivo.", "This backup is invalid or belongs to another device.")) } } }
    private val deviceCredentialConfirmation = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val ticket = pendingAuthorizationTicket
        deviceCredentialInProgress = false
        if (result.resultCode == RESULT_OK && ticket.isNotBlank()) completeProtectedAuthorization(ticket)
        else if (ticket.isNotBlank()) {
            val kind = pendingAuthorizationKind
            pendingAuthorizationTicket = ""
            pendingAuthorizationKind = NexusAuthorizationKind.NONE
            state = if (kind == NexusAuthorizationKind.WAKE) state.copy(wakeStatus = nexusCopy("Risveglio non autorizzato", "Wake not authorized")) else state.copy(activity = nexusCopy("Autorizzazione annullata", "Authorization cancelled"))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidCrashStore.install(this)
        NexusSystemBars.apply(window)
        store = LocalChatStore(this)
        store.reconcileAnsweredPendingRequests()
        secureTokens = SecureTokenStore(this)
        frameHealth = FrameHealthMonitor(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(NEXUS_ACTIVITY_CHANNEL, "Attività NexusNXS", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Avvisi privati quando NexusNXS completa un’attività"; lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE })
        listOf("remoteToken", "guestToken").forEach { name -> prefs.getString(name, "").orEmpty().takeIf(String::isNotBlank)?.let { secureTokens.write(name, it); prefs.edit { remove(name) } } }
        textToSpeech = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val deviceLocale = resources.configuration.locales[0]
                val result = textToSpeech?.setLanguage(deviceLocale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    textToSpeech?.language = Locale.ENGLISH
                }
            }
        }
        textToSpeech?.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            private fun update(id: String?, value: String) = postUi {
                if (id == speechUtterance && id?.isNotBlank() == true) state = state.copy(speechPlayback = value)
            }
            override fun onStart(utteranceId: String?) = update(utteranceId, "speaking")
            override fun onDone(utteranceId: String?) = update(utteranceId, "idle")
            @Deprecated("Compatibility with older engines")
            override fun onError(utteranceId: String?) = update(utteranceId, "idle")
            override fun onError(utteranceId: String?, errorCode: Int) = update(utteranceId, "idle")
        })
        if (!prefs.getBoolean("legacyTransportErrorsCleaned", false)) {
            store.deleteLegacyTransportFailureConversations()
            prefs.edit { putBoolean("legacyTransportErrorsCleaned", true) }
        }
        val savedConversationId = prefs.getString("currentConversationId", "").orEmpty()
        // La conversazione scelta dall'utente non e una sessione di sicurezza:
        // resta selezionata anche dopo una lunga permanenza in background. La
        // finestra temporale continua a proteggere soltanto proposte Work e token.
        val canResume = store.get(savedConversationId) != null
        val powerSaver = (getSystemService(POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true
        val initialConversationId = if (canResume) savedConversationId else store.createConversation()
        val savedModel = when (prefs.getString("model", "NexusNXS Rapido").orEmpty()) { "Automatico", "Qwen3 8B", "nexus-fast" -> "NexusNXS Rapido"; "Qwen3 14B", "nexus-deep" -> "NexusNXS Pro"; else -> prefs.getString("model", "NexusNXS Rapido").orEmpty() }
        val privacyMode = prefs.getBoolean("privacyMode", false)
        applyWindowPrivacy(temporary = false, privacyMode = privacyMode)
        val restoredWork = runCatching { JSONObject(secureTokens.read("workProposal")) }.getOrNull()
            ?.takeIf { System.currentTimeMillis() - it.optLong("savedAt") <= SESSION_RESUME_WINDOW_MS }
        if (restoredWork == null) secureTokens.clear("workProposal")
        // Work resta chiuso finché il server autenticato non pubblica una
        // capability esplicita. Una preferenza salvata non può riattivarlo da sola.
        val startAsAssistant = savedInstanceState?.getBoolean("nexusAssistantOverlay") ?: (intent?.action == Intent.ACTION_ASSIST)
        state = state.copy(model = savedModel, work = false, profileUri = prefs.getString("profileUri", "").orEmpty(), reduceMotion = prefs.getBoolean("reduceMotion", false) || powerSaver, draft = prefs.getString("draft:$initialConversationId", "").orEmpty(), conversationId = initialConversationId, pendingCount = store.pendingCount(), privacyMode = privacyMode, hapticsEnabled = prefs.getBoolean("hapticsEnabled", true), workTicketId = "", workPreview = "", workRisk = "", assistantOverlay = startAsAssistant, slashCommands = loadCustomSlashCommands())
        runCatching {
            getSystemService(ConnectivityManager::class.java).registerNetworkCallback(
                NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
                networkCallback
            )
        }
        refreshChats(openIfEmpty = true)
        setContent { NexusTheme { if (state.assistantOverlay) NexusAssistantOverlay(state, ::dispatch) else NexusInstantApp(state, ::dispatch) } }
        handleIncomingIntent(intent)
        probeConnection()
    }

    override fun onResume() {
        super.onResume()
        appVisible = true
        if (::frameHealth.isInitialized) frameHealth.start()
        if (::store.isInitialized) {
            probeConnection()
            loadWakeCapabilities()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean("nexusAssistantOverlay", state.assistantOverlay)
    }

    override fun onStop() {
        appVisible = false
        flushDraftPersistence()
        if (::frameHealth.isInitialized) frameHealth.stop()
        if (!isChangingConfigurations) {
            prefs.edit {
                putString("currentConversationId", if (state.temporary) "" else state.conversationId)
            }
        }
        super.onStop()
    }

    /**
     * Keep temporary chats out of the system overview without replacing the app Surface.
     * Toggling FLAG_SECURE while Compose is drawing produces a visible black frame on some
     * Samsung devices, so that flag is reserved for the explicit, persistent privacy mode.
     */
    private fun applyWindowPrivacy(temporary: Boolean, privacyMode: Boolean) {
        if (privacyMode) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(!temporary && !privacyMode)
        }
    }

    private fun protectTemporaryConversation(enabled: Boolean) {
        applyWindowPrivacy(temporary = enabled, privacyMode = state.privacyMode)
    }

    private fun clearTemporaryReturnState() {
        temporaryReturnConversationId = ""
        temporaryReturnDraft = ""
        temporaryReturnWork = false
    }

    /** Evita che token o fasi tardive di una chat compaiano in un'altra schermata. */
    private fun streamMatchesUi(conversationId: String, temporary: Boolean, generation: Long): Boolean =
        generation != 0L && generation == chatGeneration &&
            if (temporary) state.temporary else conversationId.isNotBlank() && !state.temporary && state.conversationId == conversationId

    private fun dispatch(action: String, value: String = "") {
        when (action) {
            "drawer" -> state = state.copy(drawer = !state.drawer)
            "closeDrawer" -> state = state.copy(drawer = false)
            "chat" -> { prefs.edit { putBoolean("workMode", false) }; state = state.copy(screen = NexusScreen.CHAT, work = false, drawer = false) }
            "work" -> if (state.remoteWorkAvailable) { prefs.edit { putBoolean("workMode", true) }; state = state.copy(screen = NexusScreen.CHAT, work = true, drawer = false) }
            "library" -> state = state.copy(screen = NexusScreen.LIBRARY, drawer = false)
            "projects" -> if (state.remoteWorkAvailable) state = state.copy(screen = NexusScreen.PROJECTS, drawer = false)
            "activity" -> state = state.copy(screen = NexusScreen.ACTIVITY, drawer = false)
            "remote" -> if (state.pairingAvailable || state.wakePairingAvailable || state.wakeAvailable) state = state.copy(screen = NexusScreen.REMOTE, drawer = false)
            "scheduled" -> if (state.remoteWorkAvailable) state = state.copy(screen = NexusScreen.SCHEDULED, drawer = false)
            "settings" -> state = state.copy(screen = NexusScreen.SETTINGS, drawer = false)
            // Keep the translucent composition alive until Android removes its
            // task. Switching to the full UI here flashes an opaque app frame.
            "assistantClose" -> { finishAndRemoveTask() }
            "assistantExpand" -> {
                // Expand the same controller: drafts, attachments and an in-flight
                // response must not be copied to a second activity or cancelled.
                stopAllSpeech()
                state = state.copy(screen = NexusScreen.CHAT, drawer = false, assistantOverlay = false, assistantInvocation = 0L, assistantEntry = value)
                onAssistantPresentationChanged()
            }
            "assistantEntryConsumed" -> state = state.copy(assistantEntry = "")
            "back" -> state = state.copy(screen = NexusScreen.CHAT)
            "modelSheet" -> state = state.copy(modelSheet = true)
            "closeModel" -> state = state.copy(modelSheet = false)
            "model" -> { prefs.edit { putString("model", value) }; state = state.copy(model = value, modelSheet = false) }
            "draft" -> {
                if (state.connection != NexusConnection.ONLINE) return
                if (!state.temporary && state.conversationId.isNotBlank()) queueDraftPersistence(state.conversationId, value)
                state = state.copy(draft = value)
            }
            "chatQuery" -> state = state.copy(chatQuery = value, chats = (if (value.isBlank()) store.list() else store.search(value)).toChatRows())
            "conversationSearchOpen" -> state = state.copy(conversationSearchOpen = !state.conversationSearchOpen, conversationSearch = "")
            "conversationSearch" -> state = state.copy(conversationSearch = value)
            "attach" -> if (value.isBlank()) state = state.copy(attachment = null, attachmentUri = "", attachmentMime = "", attachmentData = "") else if (state.connection == NexusConnection.ONLINE) runCatching { JSONObject(value) }.fold(
                onSuccess = { state = state.copy(attachment = it.optString("name"), attachmentUri = it.optString("uri"), attachmentMime = it.optString("mime"), attachmentData = it.optString("data")) },
                onFailure = { state = state.copy(attachment = value) }
            )
            "profilePhoto" -> { prefs.edit { putString("profileUri", value) }; state = state.copy(profileUri = value) }
            "reduceMotion" -> { val enabled = !state.reduceMotion; prefs.edit { putBoolean("reduceMotion", enabled) }; state = state.copy(reduceMotion = enabled) }
            "haptics" -> { val enabled = !state.hapticsEnabled; prefs.edit { putBoolean("hapticsEnabled", enabled) }; state = state.copy(hapticsEnabled = enabled) }
            "privacyMode" -> { val enabled = !state.privacyMode; prefs.edit { putBoolean("privacyMode", enabled) }; applyWindowPrivacy(state.temporary, enabled); state = state.copy(privacyMode = enabled) }
            "exportBackup" -> backupExporter.launch("NexusNXS-backup-${System.currentTimeMillis()}.nexus")
            "importBackup" -> backupImporter.launch(arrayOf("application/octet-stream", "application/json", "text/plain"))
            "diagnostics" -> state = state.copy(diagnosticsOpen = !state.diagnosticsOpen)
            "new" -> openConversation(store.createConversation())
            "open" -> openConversation(value)
            "deleteChat" -> { val deletingCurrent = value == state.conversationId; store.deleteConversation(value); if (deletingCurrent) openConversation(store.createConversation()) else refreshChats(true) }
            "renameChat" -> { val parts = value.split('\n', limit = 2); if (parts.size == 2) { store.renameConversation(parts[0], parts[1]); refreshChats() } }
            "editTurn" -> { val parts = value.split('\n', limit = 2); val index = parts.firstOrNull()?.toIntOrNull(); if (index != null && parts.size == 2 && state.conversationId.isNotBlank()) { val branch = store.branchConversation(state.conversationId, index); openConversation(branch); prefs.edit { putString("draft:$branch", parts[1]) }; state = state.copy(draft = parts[1]); refreshChats() } }
            "pinChat" -> { store.togglePinned(value); refreshChats() }
            "archiveChat" -> { store.archiveConversation(value); openConversation(store.createConversation()); refreshChats(true) }
            "restoreChat" -> { store.restoreConversation(value); refreshChats(true) }
            "send" -> sendMessage()
            "voiceSend" -> {
                val spoken = value.trim()
                if (spoken.isNotBlank() && !state.busy && state.connection == NexusConnection.ONLINE) {
                    state = state.copy(draft = spoken)
                    speakNextAnswer = true
                    sendMessage()
                }
            }
            "retryQueue" -> retryPendingRequests()
            "approveWork" -> authorizeWorkProposal()
            "cancelWork" -> {
                requestActiveWorkCancellation()
                clearWorkProposal()
                state = state.copy(busy = false, workTicketId = "", workPreview = "", workRisk = "", activity = nexusCopy("Operazione annullata", "Operation cancelled"))
            }
            "share" -> shareConversation()
            "continueOnPc" -> continueConversationOnPc()
            "speak" -> speakOrStop(value)
            "stopSpeech" -> stopAllSpeech()
            "regenerate" -> regenerateLastResponse()
            "approveTraining" -> submitApprovedFeedback(value)
            "dismissError" -> state = state.copy(error = null)
            "temporary" -> if (state.temporary) {
                val returnId = temporaryReturnConversationId.takeIf { it.isNotBlank() && store.get(it) != null } ?: store.createConversation()
                val returnWork = temporaryReturnWork
                val returnDraft = temporaryReturnDraft
                activeConnection?.disconnect()
                activeConnection = null
                protectTemporaryConversation(false)
                openConversation(returnId)
                prefs.edit {
                    putBoolean("workMode", returnWork)
                    putString("draft:$returnId", returnDraft)
                }
                state = state.copy(work = returnWork, draft = returnDraft, busy = false, streaming = "", activity = "")
                clearTemporaryReturnState()
            } else {
                temporaryReturnConversationId = state.conversationId
                temporaryReturnDraft = state.draft
                temporaryReturnWork = state.work
                protectTemporaryConversation(true)
                state = state.copy(temporary = true, work = false, screen = NexusScreen.CHAT, conversationId = "", turns = emptyList(), draft = "", attachment = null, attachmentUri = "", attachmentMime = "", attachmentData = "", error = null)
            }
            "saveTemporary" -> if (state.temporary) {
                val savedTurns = state.turns
                val id = store.createConversation()
                savedTurns.forEach { store.addTurn(id, it.role, it.content) }
                protectTemporaryConversation(false)
                openConversation(id)
                clearTemporaryReturnState()
                refreshChats()
            }
            "stop" -> {
                chatGeneration++
                clearPendingStreamUi()
                if (activeWorkOperationId.isNotBlank()) requestActiveWorkCancellation()
                else { activeConnection?.disconnect(); activeConnection = null }
                state = state.copy(busy = false, activity = nexusCopy("Interrotta", "Stopped"))
            }
            "pairing" -> if (state.pairingAvailable) state = state.copy(pairing = !state.pairing)
            "pair" -> if (state.pairingAvailable) pair(value)
            "pairWake" -> if (state.wakePairingAvailable) pairWakeRelay(value)
            "selectWake" -> if (state.wakeAvailable && state.wakeTargets.any { it.id == value }) state = state.copy(wakeSelectedTarget = value)
            "planWake" -> if (state.wakeAvailable) planWake(value.ifBlank { state.wakeSelectedTarget })
            "approveWake" -> authorizeWakeProposal()
            "cancelWake" -> cancelWakeProposal()
            "probeWake" -> if (appVisible) loadWakeCapabilities(force = true)
            // Le coroutine Compose possono restare vive mentre l'activity e in
            // background: i refresh periodici non devono quindi generare rete.
            // Streaming e richieste gia avviate restano invece intatti e possono
            // completarsi con la relativa notifica privata.
            "probe" -> if (appVisible) probeConnection()
            "models" -> if (appVisible) refreshModels()
            "clear" -> { uiHandler.removeCallbacks(persistDraftRunnable); pendingDraftConversationId = ""; pendingDraftValue = ""; store.clearAll(); refreshChats(true); state = state.copy(screen = NexusScreen.CHAT) }
        }
    }

    private fun refreshChats(openIfEmpty: Boolean = false) {
        store.deleteEmptyConversationsExcept(state.conversationId)
        var rows = store.list().toChatRows()
        if (rows.isEmpty() && openIfEmpty) { store.createConversation(); rows = store.list().toChatRows() }
        val id = state.conversationId.ifBlank { rows.firstOrNull()?.id.orEmpty() }
        state = state.copy(chats = rows)
        if (id.isNotBlank()) openConversation(id)
    }

    private fun openConversation(id: String) {
        flushDraftPersistence()
        val row = store.get(id)
        val turns = row?.optJSONArray("turns")?.toTurns() ?: emptyList()
        prefs.edit { putString("currentConversationId", id) }
        state = state.copy(screen = NexusScreen.CHAT, drawer = false, temporary = false, conversationId = id, turns = turns, draft = prefs.getString("draft:$id", "").orEmpty(), streaming = "", error = null, conversationSearchOpen = false, conversationSearch = "")
    }

    private fun loadCustomSlashCommands(): List<SlashCommandRow> = runCatching {
        val values = JSONArray(prefs.getString("slashCommands", "[]").orEmpty())
        buildList {
            for (index in 0 until values.length()) {
                val item = values.optJSONObject(index) ?: continue
                val name = item.optString("name").lowercase(Locale.ROOT)
                val template = item.optString("template").trim()
                if (!Regex("^[a-z0-9][a-z0-9-]{0,23}$").matches(name) || template.isBlank() || builtinSlashCommands().any { it.name == name }) continue
                add(SlashCommandRow(name, item.optString("label", name).take(48), nexusCopy("Comando personale", "Personal command"), template.take(2_000), true))
                if (size == 24) break
            }
        }
    }.getOrDefault(emptyList())

    private fun persistCustomSlashCommands(commands: List<SlashCommandRow>) {
        val values = JSONArray()
        commands.filter { it.custom }.take(24).forEach { command ->
            values.put(JSONObject().put("name", command.name).put("label", command.label).put("template", command.template))
        }
        prefs.edit { putString("slashCommands", values.toString()) }
    }

    private fun resolveSlashInput(value: String): SlashResolution {
        val raw = value.trim()
        val definition = Regex("^(?:/nuovo\\s+|(?:crea|aggiungi|salva|imposta)\\s+(?:il\\s+)?comando\\s+/?)([a-z0-9][a-z0-9-]{0,23})\\s*(?:=|:|come\\s+)\\s*([\\s\\S]+)$", RegexOption.IGNORE_CASE).find(raw)
        if (definition != null) {
            val name = definition.groupValues[1].lowercase(Locale.ROOT)
            if (builtinSlashCommands().any { it.name == name }) return SlashResolution(handled = true, message = nexusCopy("/$name è un comando integrato e non può essere sostituito.", "/$name is built in and cannot be replaced."))
            val command = SlashCommandRow(name, name, nexusCopy("Comando personale", "Personal command"), definition.groupValues[2].trim().take(2_000), true)
            val commands = listOf(command) + state.slashCommands.filterNot { it.name == name }
            persistCustomSlashCommands(commands)
            return SlashResolution(handled = true, message = nexusCopy("Comando /$name salvato su questo dispositivo.", "Command /$name saved on this device."), commands = commands)
        }
        val removal = Regex("^(?:/rimuovi\\s+|(?:rimuovi|elimina|cancella)\\s+(?:il\\s+)?comando\\s+/?)([a-z0-9][a-z0-9-]{0,23})\\s*$", RegexOption.IGNORE_CASE).find(raw)
        if (removal != null) {
            val name = removal.groupValues[1].lowercase(Locale.ROOT)
            val commands = state.slashCommands.filterNot { it.name == name }
            if (commands.size == state.slashCommands.size) return SlashResolution(handled = true, message = nexusCopy("Il comando /$name non esiste.", "Command /$name does not exist."))
            persistCustomSlashCommands(commands)
            return SlashResolution(handled = true, message = nexusCopy("Comando /$name rimosso.", "Command /$name removed."), commands = commands)
        }
        val invocation = Regex("^/([a-z0-9][a-z0-9-]{0,23})(?:\\s+([\\s\\S]*))?$", RegexOption.IGNORE_CASE).find(raw) ?: return SlashResolution(text = raw)
        val name = invocation.groupValues[1].lowercase(Locale.ROOT)
        val command = (state.slashCommands + builtinSlashCommands()).firstOrNull { it.name == name }
            ?: return SlashResolution(handled = true, message = nexusCopy("Comando /$name non riconosciuto. Scrivi / per vedere quelli disponibili.", "Unknown command /$name. Type / to see available commands."))
        if (command.template.isBlank()) return SlashResolution(handled = true, message = command.description)
        val argument = invocation.groupValues.getOrNull(2).orEmpty().trim().ifBlank { nexusCopy("il contenuto della richiesta precedente", "the content of the previous request") }
        return SlashResolution(text = if (command.template.contains("{testo}")) command.template.replace("{testo}", argument) else listOf(command.template, argument).filter(String::isNotBlank).joinToString(" "))
    }

    private fun sendMessage() {
        if (state.connection != NexusConnection.ONLINE) {
            state = state.copy(
                status = nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable"),
                error = nexusCopy("Riconnessione automatica in corso.", "Automatic reconnection in progress.")
            )
            if (appVisible) probeConnection()
            return
        }
        val enteredText = state.draft.trim().replace(Regex("%20", RegexOption.IGNORE_CASE), " ")
        if ((enteredText.isBlank() && state.attachment == null) || state.busy) return
        val inputText = enteredText.ifBlank { nexusCopy("Analizza questo allegato.", "Analyze this attachment.") }
        val slashResolution = resolveSlashInput(inputText)
        if (slashResolution.handled) {
            val id = state.conversationId
            if (!state.temporary && id.isNotBlank()) discardDraftPersistence(id)
            state = state.copy(draft = "", activity = slashResolution.message, slashCommands = slashResolution.commands ?: state.slashCommands)
            return
        }
        ensureNotificationPermission()
        val text = slashResolution.text
        val speakReply = speakNextAnswer.also { speakNextAnswer = false }
        val inferredWork = state.remoteWorkAvailable && explicitDesktopIntent(text)
        if ((state.work || inferredWork) && !state.temporary) { planWork(text); return }
        val generation = ++chatGeneration
        val attachment = encodedAttachment()
        val effectiveText = compatibleAttachmentText(text, attachment)
        if (state.temporary) {
            val previous = state.turns
            val pendingTurns = previous + Turn("user", text)
            state = state.copy(draft = "", attachment = null, turns = pendingTurns, busy = true, streaming = "", activity = nexusCopy("Comprendo la richiesta…", "Understanding your request…"), error = null, status = nexusCopy("Chat temporanea", "Temporary chat"))
            runTask {
                var failure: String? = null
                val answer = try { guestStream(effectiveText, state.model, previous, attachment, uiTemporary = true, uiGeneration = generation) } catch (_: Exception) { failure = nexusCopy("I server NexusNXS non sono raggiungibili. In modalità temporanea il messaggio non viene archiviato.", "NexusNXS servers are unreachable. Temporary-chat messages are not stored."); "" }
                if (destroyed) return@runTask
                postUi {
                    if (!state.temporary || generation != chatGeneration) return@postUi
                    state = state.copy(turns = if (answer.isBlank()) pendingTurns else pendingTurns + Turn("assistant", answer), streaming = "", activity = "", busy = false, error = failure, status = if (failure != null) nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable") else nexusCopy("Chat temporanea", "Temporary chat"), connection = if (failure != null) NexusConnection.OFFLINE else NexusConnection.ONLINE)
                    if (answer.isNotBlank()) {
                        if (speakReply) speakOrStop(answer)
                        notifyCompletion()
                    }
                }
            }
            return
        }
        val id = state.conversationId.ifBlank { store.createConversation() }
        val previousTurns = state.turns
        store.addTurn(id, "user", text + (state.attachment?.let { "\n\nAllegato: $it" } ?: ""))
        val clientMessageId = store.queueRequest(id, effectiveText, state.model, attachment?.toString().orEmpty())
        discardDraftPersistence(id)
        state = state.copy(conversationId = id, chats = store.list().toChatRows(), draft = "", attachment = null, busy = true, streaming = "", activity = nexusCopy("Comprendo la richiesta…", "Understanding your request…"), error = null, turns = store.get(id).optJSONArray("turns").toTurns(), status = nexusCopy("NexusNXS sta lavorando…", "NexusNXS is working…"), pendingCount = store.pendingCount())
        runTask {
            var failed = false
            val answer = try { guestStream(effectiveText, state.model, contextTurns = previousTurns, attachment = attachment, clientMessageId = clientMessageId, uiConversationId = id, uiGeneration = generation) } catch (_: Exception) { failed = true; "" }
            if (destroyed) return@runTask
            if (answer.isNotBlank()) { store.addTurn(id, "assistant", answer); store.completePendingRequest(clientMessageId) }
            postUi {
                if (generation != chatGeneration) { state = state.copy(chats = store.list().toChatRows(), pendingCount = store.pendingCount()); return@postUi }
                val showingConversation = state.conversationId == id && !state.temporary
                state = state.copy(turns = if (showingConversation) store.get(id).optJSONArray("turns").toTurns() else state.turns, streaming = if (showingConversation) "" else state.streaming, activity = if (showingConversation) "" else state.activity, busy = false, error = if (showingConversation) null else state.error, status = if (failed) nexusCopy("Server NexusNXS non raggiungibili · ${store.pendingCount()} in coda", "NexusNXS servers unreachable · ${store.pendingCount()} queued") else "Online", connection = if (failed) NexusConnection.OFFLINE else NexusConnection.ONLINE, pendingCount = store.pendingCount())
                refreshChats()
                if (failed) probeConnection() else {
                    if (speakReply && answer.isNotBlank()) speakOrStop(answer)
                    notifyCompletion()
                }
            }
        }
    }

    /**
     * Promuove automaticamente soltanto richieste inequivocabili rivolte al PC.
     * Una frase generica resta sempre conversazione: nessuna euristica può
     * ampliare silenziosamente l'autorizzazione dell'utente.
     */
    private fun explicitDesktopIntent(text: String): Boolean {
        val target = Regex("\\b(?:pc|computer|workstation|desktop|windows)\\b", RegexOption.IGNORE_CASE)
        val operation = Regex("\\b(?:apri|chiudi|avvia|esegui|crea|modifica|sposta|rinomina|elimina|installa|disinstalla|open|close|start|run|create|edit|move|rename|delete|install|uninstall)\\b", RegexOption.IGNORE_CASE)
        return target.containsMatchIn(text) && operation.containsMatchIn(text)
    }

    private fun notifyCompletion() {
        if (appVisible || android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        val open = PendingIntent.getActivity(this, 17, Intent(this, NexusMainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = android.app.Notification.Builder(this, NEXUS_ACTIVITY_CHANNEL).setSmallIcon(R.drawable.ic_nexus_notification)
            .setContentTitle(nexusCopy("NexusNXS ha terminato", "NexusNXS has finished")).setContentText(nexusCopy("La risposta è pronta nell’app.", "Your response is ready in the app.")).setContentIntent(open).setAutoCancel(true)
            .setVisibility(if (state.privacyMode) android.app.Notification.VISIBILITY_SECRET else android.app.Notification.VISIBILITY_PRIVATE).build()
        getSystemService(NotificationManager::class.java).notify(17, notification)
    }

    /**
     * Invia soltanto la coppia domanda/risposta scelta dall'utente. Il click
     * sulla voce esplicita nel foglio azioni costituisce consenso per questo
     * singolo contributo; cronologia, allegati e dati del dispositivo restano
     * esclusi. Il server conserva il record in quarantena fino alla review.
     */
    private fun submitApprovedFeedback(response: String) {
        if (state.temporary || response.isBlank() || state.connection != NexusConnection.ONLINE) return
        val answerIndex = state.turns.indexOfLast { it.role == "assistant" && it.content == response }
        val prompt = state.turns.take(answerIndex.coerceAtLeast(0)).lastOrNull { it.role == "user" }?.content
            ?.substringBefore("\n\nAllegato:")?.trim().orEmpty()
        if (prompt.isBlank()) {
            state = state.copy(status = nexusCopy("Domanda originale non disponibile", "Original prompt unavailable"))
            return
        }
        state = state.copy(status = nexusCopy("Invio contributo volontario…", "Sending voluntary contribution…"))
        runTask {
            val message = try {
                val token = ensureGuestToken()
                val result = http("/api/guest/feedback", JSONObject()
                    .put("prompt", prompt)
                    .put("response", response)
                    .put("model", publicModelId(state.model))
                    .put("mode", routedMode(prompt, state.model))
                    .put("consent", true), token)
                if (result.optString("status") == "received") nexusCopy("Contributo inviato in revisione", "Contribution sent for review")
                else result.optString("error", nexusCopy("Contributo non accettato", "Contribution not accepted"))
            } catch (_: Exception) {
                nexusCopy("Contributo non inviato: riprova più tardi", "Contribution not sent: try again later")
            }
            if (!destroyed) postUi { state = state.copy(status = message) }
        }
    }

    private fun ensureNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 170)
    }

    private fun planWork(instruction: String) {
        if (!state.remoteWorkAvailable || state.wakeTicketId.isNotBlank() || pendingAuthorizationKind != NexusAuthorizationKind.NONE) return
        val token = secureTokens.read("remoteToken")
        if (token.isBlank()) {
            state = state.copy(error = nexusCopy("Associa prima la workstation NexusNXS dalla sezione Remote.", "Pair your NexusNXS workstation from Remote first."))
            return
        }
        val generation = ++chatGeneration
        val id = state.conversationId.ifBlank { store.createConversation() }
        store.addTurn(id, "user", instruction)
        discardDraftPersistence(id)
        state = state.copy(conversationId = id, draft = "", busy = true, activity = nexusCopy("Creo un piano verificabile…", "Creating a verifiable plan…"), error = null, turns = store.get(id)?.optJSONArray("turns")?.toTurns().orEmpty())
        runTask {
            val result = try { http("/api/actions/plan", JSONObject().put("instruction", instruction), token) } catch (_: Exception) { JSONObject().put("error", nexusCopy("La workstation non è raggiungibile. Il lavoro resta nella cronologia.", "The workstation is unreachable. This work remains in history.")) }
            if (destroyed) return@runTask
            val proposal = result.optJSONObject("proposal")
            val message = result.optString("message").ifBlank { result.optString("error", nexusCopy("Nessun piano disponibile.", "No plan is available.")) }
            store.addTurn(id, "assistant", message)
            postUi {
                if (generation != chatGeneration) { state = state.copy(chats = store.list().toChatRows()); return@postUi }
                if (proposal != null && proposal.optString("id").isNotBlank()) persistWorkProposal(proposal.optString("id"), proposal.optString("preview"), proposal.optString("risk"))
                val showingConversation = state.conversationId == id && !state.temporary
                state = state.copy(
                    turns = if (showingConversation) store.get(id)?.optJSONArray("turns")?.toTurns().orEmpty() else state.turns, busy = false, activity = if (showingConversation) "" else state.activity,
                    error = if (showingConversation) result.optString("error").takeIf(String::isNotBlank) else state.error,
                    workTicketId = proposal?.optString("id").orEmpty(), workPreview = proposal?.optString("preview").orEmpty(), workRisk = proposal?.optString("risk").orEmpty()
                )
                refreshChats()
            }
        }
    }

    private fun authorizeWorkProposal() {
        if (!state.remoteWorkAvailable || state.busy || !appVisible || state.wakeTicketId.isNotBlank() || pendingAuthorizationKind != NexusAuthorizationKind.NONE) return
        val ticket = state.workTicketId
        if (ticket.isBlank() || secureTokens.read("remoteToken").isBlank()) return
        pendingAuthorizationTicket = ticket
        pendingAuthorizationKind = NexusAuthorizationKind.WORK
        state = state.copy(activity = nexusCopy("Conferma la tua identità…", "Confirm your identity…"))
        requestProtectedAuthorization(ticket)
    }

    private fun authorizeWakeProposal() {
        if (!state.wakeAvailable || state.wakeBusy || !appVisible) return
        val ticket = state.wakeTicketId
        if (ticket.isBlank() || secureTokens.read("wakeToken").isBlank()) return
        pendingAuthorizationTicket = ticket
        pendingAuthorizationKind = NexusAuthorizationKind.WAKE
        state = state.copy(wakeStatus = nexusCopy("Conferma la tua identità…", "Confirm your identity…"))
        requestProtectedAuthorization(ticket)
    }

    private fun requestProtectedAuthorization(ticket: String) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.P) {
            launchDeviceCredentialConfirmation(ticket)
            return
        }
        val callback = object : android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: android.hardware.biometrics.BiometricPrompt.AuthenticationResult?) {
                completeProtectedAuthorization(ticket)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                if (destroyed || deviceCredentialInProgress && pendingAuthorizationTicket == ticket) return
                val credentialFallback = errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE ||
                    errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS ||
                    errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT ||
                    errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT
                if (android.os.Build.VERSION.SDK_INT == android.os.Build.VERSION_CODES.P && credentialFallback) {
                    launchDeviceCredentialConfirmation(ticket)
                } else if (pendingAuthorizationTicket == ticket) {
                    val kind = pendingAuthorizationKind
                    pendingAuthorizationTicket = ""
                    pendingAuthorizationKind = NexusAuthorizationKind.NONE
                    state = if (kind == NexusAuthorizationKind.WAKE) state.copy(wakeStatus = nexusCopy("Risveglio non autorizzato", "Wake not authorized")) else state.copy(activity = nexusCopy("Autorizzazione annullata", "Authorization cancelled"))
                }
            }
        }
        val wake = pendingAuthorizationKind == NexusAuthorizationKind.WAKE
        val builder = android.hardware.biometrics.BiometricPrompt.Builder(this)
            .setTitle(if (wake) nexusCopy("Autorizza risveglio", "Authorize wake") else nexusCopy("Autorizza Cuore", "Authorize Core"))
            .setSubtitle(if (wake) nexusCopy("Conferma prima di inviare il segnale", "Confirm before sending the signal") else nexusCopy("Conferma prima di eseguire il piano", "Confirm before running the plan"))
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            builder.setAllowedAuthenticators(
                android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
        } else if (android.os.Build.VERSION.SDK_INT == android.os.Build.VERSION_CODES.Q) {
            builder.setDeviceCredentialAllowed(true)
        } else {
            builder.setNegativeButton(
                nexusCopy("Usa PIN", "Use PIN"),
                mainExecutor
            ) { _, _ -> launchDeviceCredentialConfirmation(ticket) }
        }
        builder.build().authenticate(android.os.CancellationSignal(), mainExecutor, callback)
    }

    private fun launchDeviceCredentialConfirmation(ticket: String) {
        if (destroyed || pendingAuthorizationTicket != ticket || deviceCredentialInProgress) return
        val wake = pendingAuthorizationKind == NexusAuthorizationKind.WAKE
        val keyguard = getSystemService(KeyguardManager::class.java)
        val intent = keyguard?.takeIf { it.isDeviceSecure }?.createConfirmDeviceCredentialIntent(
            if (wake) nexusCopy("Autorizza risveglio", "Authorize wake") else nexusCopy("Autorizza Cuore", "Authorize Core"),
            if (wake) nexusCopy("Sblocca il dispositivo per inviare il segnale", "Unlock your device to send the signal") else nexusCopy("Sblocca il dispositivo per eseguire il piano", "Unlock your device to run the plan")
        )
        if (intent == null) {
            pendingAuthorizationTicket = ""
            pendingAuthorizationKind = NexusAuthorizationKind.NONE
            state = state.copy(
                activity = "",
                error = nexusCopy(
                    if (wake) "Configura un blocco schermo sicuro per autorizzare il risveglio." else "Configura un blocco schermo sicuro per autorizzare le operazioni Cuore.",
                    if (wake) "Set up a secure screen lock to authorize wake." else "Set up a secure screen lock to authorize Core actions."
                ),
                wakeStatus = if (wake) nexusCopy("Blocco schermo sicuro richiesto", "Secure screen lock required") else state.wakeStatus
            )
        } else {
            deviceCredentialInProgress = true
            deviceCredentialConfirmation.launch(intent)
        }
    }

    private fun completeProtectedAuthorization(ticket: String) {
        when (pendingAuthorizationKind) {
            NexusAuthorizationKind.WORK -> completeWorkAuthorization(ticket)
            NexusAuthorizationKind.WAKE -> completeWakeAuthorization(ticket)
            NexusAuthorizationKind.NONE -> Unit
        }
    }

    private fun completeWorkAuthorization(ticket: String) {
        if (destroyed || pendingAuthorizationKind != NexusAuthorizationKind.WORK || pendingAuthorizationTicket != ticket) return
        pendingAuthorizationTicket = ""
        pendingAuthorizationKind = NexusAuthorizationKind.NONE
        if (!appVisible || state.workTicketId != ticket || !state.remoteWorkAvailable || state.busy) {
            state = state.copy(activity = "", error = nexusCopy("Il piano non è più autorizzabile.", "This plan can no longer be authorized."))
            return
        }
        executeAuthorizedWorkProposal(ticket)
    }

    private fun executeAuthorizedWorkProposal(authorizedTicket: String) {
        if (!state.remoteWorkAvailable) return
        val ticket = state.workTicketId
        val token = secureTokens.read("remoteToken")
        val conversationId = state.conversationId
        if (ticket.isBlank() || ticket != authorizedTicket || token.isBlank() || state.busy) return
        val operationId = java.util.UUID.randomUUID().toString()
        activeWorkOperationId = operationId
        activeWorkToken = token
        workCancellationRequested = false
        // Il ticket resta cifrato finché il gateway conferma il risultato: una
        // chiusura dell'app o un cambio rete non può perdere un piano approvabile.
        state = state.copy(busy = true, activity = nexusCopy("Eseguo e verifico…", "Running and verifying…"))
        runTask {
            val result = try {
                httpWork(
                    JSONObject().put("ticketId", ticket).put("approved", true).put("operationId", operationId),
                    token,
                    operationId
                )
            } catch (_: Exception) {
                if (workCancellationRequested && activeWorkOperationId == operationId) {
                    JSONObject().put("error", nexusCopy("Operazione annullata.", "Operation cancelled.")).put("code", "ACTION_CANCELLED")
                } else JSONObject().put("error", nexusCopy("Connessione interrotta prima della conferma del risultato.", "Connection interrupted before the result was confirmed."))
            }
            // Una risposta completata vince su un annullamento arrivato troppo
            // tardi: ACTION_CANCELLED viene sintetizzato soltanto se la richiesta
            // execute è davvero fallita mentre l'annullamento era in corso.
            val cancelled = result.optString("code") == "ACTION_CANCELLED"
            if (activeWorkOperationId == operationId) {
                activeWorkOperationId = ""
                activeWorkToken = ""
                activeWorkConnection = null
                workCancellationRequested = false
            }
            if (destroyed) return@runTask
            val message = if (cancelled) "Operazione annullata." else listOf(result.optString("message"), result.optString("stdout"), result.optString("stderr")).filter(String::isNotBlank).joinToString("\n\n").ifBlank { result.optString("error", "Operazione completata.") }
            store.addTurn(conversationId, "assistant", message, result.optJSONArray("artifacts")?.toString().orEmpty())
            postUi {
                val failure = result.optString("error").takeIf { it.isNotBlank() && !cancelled }
                if (failure == null) clearWorkProposal()
                state = state.copy(turns = if (state.conversationId == conversationId) store.get(conversationId)?.optJSONArray("turns")?.toTurns().orEmpty() else state.turns, busy = false, activity = if (cancelled) "Operazione annullata" else "", workTicketId = if (failure == null) "" else ticket, workPreview = if (failure == null) "" else state.workPreview, workRisk = if (failure == null) "" else state.workRisk, error = failure)
                refreshChats()
            }
        }
    }

    /**
     * Il relay riceve sempre il solo ID di un target gia pubblicato dalla sua
     * allowlist. MAC, broadcast e primitive UDP non entrano mai nel client.
     */
    private fun planWake(targetId: String) {
        if (!appVisible || state.wakeBusy || !state.wakeAvailable || !state.wakeConnected || state.workTicketId.isNotBlank() || pendingAuthorizationKind != NexusAuthorizationKind.NONE) return
        val target = state.wakeTargets.firstOrNull { it.id == targetId } ?: return
        val token = secureTokens.read("wakeToken")
        if (token.isBlank()) return
        state = state.copy(wakeBusy = true, wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Preparo il risveglio…", "Preparing wake…"))
        runTask {
            val result = runCatching { wakePost("/api/wake/plan", JSONObject().put("targetId", target.id), token) }
            if (destroyed) return@runTask
            postUi {
                val proposal = result.getOrNull()?.optJSONObject("proposal")
                val ticket = proposal?.optString("id").orEmpty()
                val proposalTarget = proposal?.optString("targetId").orEmpty()
                val preview = proposal?.optString("preview").orEmpty().replace(Regex("[\\p{Cntrl}]"), " ").trim().take(160)
                val risk = proposal?.optString("risk").orEmpty()
                val expiresAt = proposal?.optLong("expiresAt") ?: 0L
                val valid = ticket.matches(Regex("[A-Za-z0-9_-]{8,128}")) && proposalTarget == target.id && preview.isNotBlank() && risk == "high" && expiresAt > System.currentTimeMillis() && expiresAt <= System.currentTimeMillis() + 120_000L
                if (valid) {
                    state = state.copy(wakeBusy = false, wakeTicketId = ticket, wakePreview = preview, wakeRisk = risk, wakeStatus = nexusCopy("Piano pronto · conferma richiesta", "Plan ready · approval required"))
                } else {
                    val message = result.exceptionOrNull()?.message?.take(160) ?: nexusCopy("Il relay ha restituito un piano non valido.", "The relay returned an invalid plan.")
                    state = state.copy(wakeBusy = false, wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeConnected = result.isSuccess, wakeStatus = message)
                }
            }
        }
    }

    private fun cancelWakeProposal() {
        if (pendingAuthorizationKind == NexusAuthorizationKind.WAKE) {
            pendingAuthorizationTicket = ""
            pendingAuthorizationKind = NexusAuthorizationKind.NONE
            deviceCredentialInProgress = false
        }
        state = state.copy(wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeBusy = false, wakeStatus = nexusCopy("Risveglio annullato", "Wake cancelled"))
    }

    private fun completeWakeAuthorization(ticket: String) {
        if (destroyed || pendingAuthorizationKind != NexusAuthorizationKind.WAKE || pendingAuthorizationTicket != ticket) return
        pendingAuthorizationTicket = ""
        pendingAuthorizationKind = NexusAuthorizationKind.NONE
        if (!appVisible || state.wakeTicketId != ticket || !state.wakeAvailable || state.wakeBusy) {
            state = state.copy(wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Il piano di risveglio non è più autorizzabile.", "The wake plan can no longer be authorized."))
            return
        }
        executeAuthorizedWakeProposal(ticket)
    }

    private fun executeAuthorizedWakeProposal(authorizedTicket: String) {
        val token = secureTokens.read("wakeToken")
        if (authorizedTicket.isBlank() || authorizedTicket != state.wakeTicketId || token.isBlank() || state.wakeBusy) return
        state = state.copy(wakeBusy = true, wakeStatus = nexusCopy("Invio il segnale verificato…", "Sending verified signal…"))
        runTask {
            val result = runCatching { wakePost("/api/wake/execute", JSONObject().put("ticketId", authorizedTicket).put("approved", true), token) }
            if (destroyed) return@runTask
            postUi {
                // Il ticket del relay e monouso anche in caso di errore. Non lo
                // riutilizziamo mai dopo una risposta incerta o una rete interrotta.
                if (result.isSuccess) {
                    capabilityProbeCompleted = false
                    state = state.copy(
                        wakeBusy = false,
                        wakeTicketId = "",
                        wakePreview = "",
                        wakeRisk = "",
                        wakeAwaiting = true,
                        wakeConnected = true,
                        wakeStatus = nexusCopy("Segnale inviato · attendo la workstation", "Signal sent · waiting for workstation")
                    )
                    scheduleWorkstationReconnectChecks()
                } else {
                    val error = result.exceptionOrNull()
                    if (error is NexusHttpException && error.statusCode == 401) clearWakeSession()
                    state = state.copy(
                        wakeBusy = false,
                        wakeTicketId = "",
                        wakePreview = "",
                        wakeRisk = "",
                        wakeConnected = error !is java.io.IOException,
                        wakeStatus = error?.message?.take(160) ?: nexusCopy("Segnale non inviato", "Signal not sent")
                    )
                }
            }
        }
    }

    private fun scheduleWorkstationReconnectChecks() {
        listOf(5_000L, 12_000L, 25_000L, 45_000L).forEach { delay ->
            uiHandler.postDelayed({
                if (!destroyed && appVisible && state.wakeAwaiting) {
                    probeConnection()
                    refreshRemoteCapabilities()
                    loadDevices()
                }
            }, delay)
        }
    }

    /**
     * Chiede al gateway di interrompere l'operazione prima di chiudere il socket
     * locale. La richiesta è best effort: una rete già interrotta può impedire al
     * server di riceverla e non implica rollback dei cambiamenti già completati.
     */
    private fun requestActiveWorkCancellation(waitMillis: Long = 0L) {
        val operationId = activeWorkOperationId
        val token = activeWorkToken
        val executionConnection = activeWorkConnection
        if (operationId.isBlank() || token.isBlank()) {
            executionConnection?.disconnect()
            return
        }
        if (workCancellationRequested) {
            executionConnection?.disconnect()
            return
        }
        workCancellationRequested = true
        try {
            val future = cancellationExecutor.submit {
                try { postWorkCancellation(operationId, token) }
                finally {
                    if (activeWorkConnection === executionConnection) activeWorkConnection = null
                    executionConnection?.disconnect()
                }
            }
            if (waitMillis > 0L) runCatching { future.get(waitMillis, TimeUnit.MILLISECONDS) }
                .onFailure { executionConnection?.disconnect() }
        } catch (_: RejectedExecutionException) {
            executionConnection?.disconnect()
        }
    }

    private fun postWorkCancellation(operationId: String, token: String) {
        val payload = JSONObject().put("operationId", operationId).toString().toByteArray(StandardCharsets.UTF_8)
        for (endpoint in endpointCandidates()) {
            val connection = openTrackedConnection(endpoint.trimEnd('/') + "/api/actions/cancel")
            try {
                connection.instanceFollowRedirects = false
                connection.requestMethod = "POST"
                connection.connectTimeout = 800
                connection.readTimeout = 800
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.outputStream.use { it.write(payload) }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                stream?.use { it.readBytes() }
                if (status in 200..299) return
            } catch (_: Exception) {
                // Il disconnect della richiesta execute resta comunque il fallback.
            } finally { closeTrackedConnection(connection) }
        }
    }

    private fun httpWork(body: JSONObject, token: String, operationId: String): JSONObject {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            if (workCancellationRequested && activeWorkOperationId == operationId) break
            try {
                return httpWorkAt(endpoint, body, token, operationId).also { rememberReachable(endpoint) }
            } catch (error: Exception) { failure = error }
        }
        throw failure ?: IllegalStateException("Operazione annullata.")
    }

    private fun httpWorkAt(base: String, body: JSONObject, token: String, operationId: String): JSONObject {
        val connection = openTrackedConnection(base.trimEnd('/') + "/api/actions/execute")
        activeWorkConnection = connection
        try {
            if (workCancellationRequested && activeWorkOperationId == operationId) throw IllegalStateException("Operazione annullata.")
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.connectTimeout = 3_500
            connection.readTimeout = 240_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val result = JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            if (status !in 200..299) throw IllegalStateException(result.optString("error", "HTTP $status"))
            return result
        } finally {
            if (activeWorkConnection === connection) activeWorkConnection = null
            closeTrackedConnection(connection)
        }
    }

    private fun persistWorkProposal(ticket: String, preview: String, risk: String) {
        secureTokens.write("workProposal", JSONObject().put("ticket", ticket).put("preview", preview).put("risk", risk).put("savedAt", System.currentTimeMillis()).toString())
    }

    private fun clearWorkProposal() = secureTokens.clear("workProposal")

    private fun shareConversation() {
        val title = state.chats.firstOrNull { it.id == state.conversationId }?.title ?: "Conversazione NexusNXS"
        val transcript = state.turns.joinToString("\n\n") { "${if (it.role == "user") "Tu" else "NexusNXS"}: ${it.content}" }
        if (transcript.isBlank()) return
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, transcript), nexusCopy("Condividi conversazione", "Share conversation")))
    }

    private fun continueConversationOnPc() {
        if (!state.pairingAvailable) return
        if (state.temporary || state.conversationId.isBlank() || state.turns.isEmpty()) return
        val token = secureTokens.read("remoteToken")
        if (token.isBlank()) { state = state.copy(error = nexusCopy("Associa la workstation dalla sezione Dispositivi per continuare sul PC.", "Pair the workstation from Devices to continue on PC.")); return }
        val conversation = store.get(state.conversationId) ?: return
        state = state.copy(busy = true, activity = nexusCopy("Trasferisco la conversazione al PC…", "Transferring the conversation to PC…"), error = null)
        runTask {
            val result = runCatching {
                http("/api/conversations/import", JSONObject().put("sourceId", state.conversationId).put("title", conversation.optString("title", "Conversazione NexusNXS")).put("turns", conversation.optJSONArray("turns")), token)
            }
            if (destroyed) return@runTask
            postUi { state = state.copy(busy = false, activity = if (result.isSuccess) nexusCopy("Pronta sul PC", "Ready on PC") else "", error = result.exceptionOrNull()?.let { nexusCopy("Trasferimento non riuscito. NexusNXS riproverà quando la workstation sarà raggiungibile.", "Transfer failed. NexusNXS will retry when the workstation is reachable.") }) }
        }
    }

    private fun speakOrStop(text: String) {
        if (state.speechPlayback != "idle" || neuralSpeechPlayer?.isPlaying == true || textToSpeech?.isSpeaking == true) {
            stopAllSpeech()
            return
        }
        stopAllSpeech()
        val token = secureTokens.read("guestToken")
        if (token.isBlank() || state.connection == NexusConnection.OFFLINE) {
            speakWithDeviceVoice(text)
            return
        }
        val generation = speechGeneration
        state = state.copy(speechPlayback = "preparing")
        runTask {
            val audio = runCatching { requestNeuralSpeech(text, token, generation) }.getOrNull()
            if (destroyed || generation != speechGeneration) { audio?.delete(); return@runTask }
            postUi {
                if (generation != speechGeneration) audio?.delete()
                else if (audio == null) speakWithDeviceVoice(text)
                else playNeuralSpeech(audio)
            }
        }
    }

    private fun requestNeuralSpeech(text: String, token: String, generation: Long): File {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            check(!destroyed && generation == speechGeneration) { "Speech cancelled" }
            var connection: HttpURLConnection? = null
            try {
                connection = openTrackedConnection(endpoint.trimEnd('/') + "/api/guest/voice/synthesize")
                speechConnection = connection
                connection.instanceFollowRedirects = false
                connection.requestMethod = "POST"
                connection.connectTimeout = 3_500
                connection.readTimeout = 90_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Accept", "audio/wav")
                connection.setRequestProperty("Authorization", "Bearer $token")
                val language = spokenLocale(text, resources.configuration.locales[0]).toLanguageTag().ifBlank { "it" }
                val payload = JSONObject().put("text", text.take(4_000)).put("language", language).put("gender", "male")
                connection.outputStream.use { it.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
                if (connection.responseCode !in 200..299) throw IllegalStateException("Voce server non disponibile")
                val output = ByteArrayOutputStream(256 * 1024)
                connection.inputStream.use { input ->
                    val buffer = ByteArray(16 * 1024)
                    var total = 0
                    while (true) {
                        check(!destroyed && generation == speechGeneration) { "Speech cancelled" }
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= 16 * 1024 * 1024) { "Risposta vocale troppo grande" }
                        output.write(buffer, 0, count)
                    }
                }
                rememberReachable(endpoint)
                return File.createTempFile("nexus-voice-", ".wav", cacheDir).apply { writeBytes(output.toByteArray()) }
            } catch (error: Exception) {
                failure = error
            } finally {
                if (speechConnection === connection) speechConnection = null
                connection?.let(::closeTrackedConnection)
            }
        }
        throw failure ?: IllegalStateException("Voce server non raggiungibile")
    }

    private fun playNeuralSpeech(file: File) {
        neuralSpeechFile = file
        neuralSpeechPlayer = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            setDataSource(file.absolutePath)
            setOnCompletionListener { stopAllSpeech() }
            setOnErrorListener { _, _, _ -> stopAllSpeech(); true }
            setOnPreparedListener { player ->
                if (player === neuralSpeechPlayer && !destroyed) { player.start(); state = state.copy(speechPlayback = "speaking") }
            }
            prepareAsync()
        }
    }

    private fun speakWithDeviceVoice(text: String) {
        textToSpeech?.language = spokenLocale(text, resources.configuration.locales[0])
        speechUtterance = "nexus-$speechGeneration"
        state = state.copy(speechPlayback = "preparing")
        val result = textToSpeech?.speak(text.take(12_000), TextToSpeech.QUEUE_FLUSH, Bundle(), speechUtterance)
        if (result != TextToSpeech.SUCCESS) state = state.copy(speechPlayback = "idle")
    }

    private fun stopAllSpeech() {
        speechGeneration++
        speechUtterance = ""
        if (!destroyed) state = state.copy(speechPlayback = "idle")
        speechConnection?.disconnect()
        speechConnection = null
        textToSpeech?.stop()
        neuralSpeechPlayer?.let { player -> runCatching { player.stop() }; player.reset(); player.release() }
        neuralSpeechPlayer = null
        neuralSpeechFile?.delete()
        neuralSpeechFile = null
    }

    override fun onDestroy() {
        flushDraftPersistence()
        destroyed = true
        pendingAuthorizationTicket = ""
        pendingAuthorizationKind = NexusAuthorizationKind.NONE
        deviceCredentialInProgress = false
        clearPendingStreamUi()
        if (::frameHealth.isInitialized) frameHealth.stop()
        runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) }
        requestActiveWorkCancellation(900L)
        activeConnection?.disconnect()
        activeConnection = null
        activeConnections.toList().forEach(HttpURLConnection::disconnect)
        activeConnections.clear()
        backgroundExecutor.shutdownNow()
        cancellationExecutor.shutdownNow()
        stopAllSpeech()
        textToSpeech?.shutdown()
        if (::store.isInitialized) store.close()
        super.onDestroy()
    }

    private fun regenerateLastResponse() {
        if (state.busy) return
        val id = state.conversationId
        val lastUserIndex = state.turns.indexOfLast { it.role == "user" }
        if (id.isBlank() || lastUserIndex < 0) return
        val generation = ++chatGeneration
        val prompt = state.turns[lastUserIndex].content.substringBefore("\n\nAllegato:")
        store.deleteLastAssistantTurn(id)
        val history = store.get(id)?.optJSONArray("turns")?.toTurns().orEmpty().dropLast(1)
        state = state.copy(turns = store.get(id).optJSONArray("turns").toTurns(), busy = true, streaming = "", activity = nexusCopy("Rigenero la risposta…", "Regenerating the response…"), error = null)
        runTask {
            var failure: String? = null
            val answer = try { guestStream(prompt, state.model, history, uiConversationId = id, uiGeneration = generation) } catch (_: Exception) { failure = nexusCopy("Connessione interrotta. La richiesta è rimasta sul telefono.", "Connection interrupted. The request remains on this phone."); "" }
            if (destroyed) return@runTask
            if (answer.isNotBlank()) store.addTurn(id, "assistant", answer)
            postUi {
                if (generation != chatGeneration) { state = state.copy(chats = store.list().toChatRows()); return@postUi }
                val showingConversation = state.conversationId == id && !state.temporary
                state = state.copy(turns = if (showingConversation) store.get(id).optJSONArray("turns").toTurns() else state.turns, streaming = if (showingConversation) "" else state.streaming, activity = if (showingConversation) "" else state.activity, busy = false, error = if (showingConversation) failure else state.error, status = if (failure != null) nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable") else "Online", connection = if (failure != null) NexusConnection.OFFLINE else NexusConnection.ONLINE)
                refreshChats()
            }
        }
    }

    private fun encodedAttachment(): JSONObject? {
        val name = state.attachment ?: return null
        val bytes = when {
            state.attachmentData.isNotBlank() -> runCatching { Base64.decode(state.attachmentData, Base64.DEFAULT) }.getOrNull()
            state.attachmentUri.isNotBlank() -> runCatching { readBoundedContent(state.attachmentUri.toUri(), MAX_ATTACHMENT_BYTES) }.getOrNull()
            else -> null
        } ?: return null
        if (bytes.size > MAX_ATTACHMENT_BYTES) throw IllegalArgumentException("L’allegato supera il limite di 1,5 MB.")
        return JSONObject().put("name", name.take(120)).put("mime", state.attachmentMime.take(80)).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }

    private fun compatibleAttachmentText(text: String, attachment: JSONObject?): String {
        if (attachment == null) return text
        val mime = attachment.optString("mime")
        if (!(mime.startsWith("text/") || mime in setOf("application/json", "application/xml"))) return text
        val decoded = runCatching { String(Base64.decode(attachment.optString("data"), Base64.DEFAULT), StandardCharsets.UTF_8) }.getOrDefault("").replace("\u0000", "").take(80_000)
        return "$text\n\n<MATERIALE_ALLEGATO_NON_FIDATO nome=\"${attachment.optString("name").replace("\"", "")}\">\n$decoded\n</MATERIALE_ALLEGATO_NON_FIDATO>"
    }

    private fun guestStream(
        text: String,
        model: String,
        contextTurns: List<Turn> = state.turns,
        attachment: JSONObject? = null,
        clientMessageId: String = java.util.UUID.randomUUID().toString(),
        uiConversationId: String = "",
        uiTemporary: Boolean = false,
        uiGeneration: Long = 0L
    ): String {
        val requestStartedAt = SystemClock.elapsedRealtime()
        val history = JSONArray().also { a -> contextTurns.takeLast(20).forEach { a.put(JSONObject().put("role", it.role).put("content", it.content)) } }
        val body = JSONObject().put("text", text).put("history", history).put("mode", routedMode(text, model)).put("model", publicModelId(model)).put("clientMessageId", clientMessageId).also { if (attachment != null) it.put("attachments", JSONArray().put(attachment)) }
        var failure: Exception? = null
        var token = secureTokens.read("guestToken")
        var tokenEndpoint = prefs.getString("guestTokenEndpoint", "").orEmpty()
        val candidates = listOf(tokenEndpoint).plus(endpointCandidates()).mapNotNull(::trustedEndpoint).distinct()
        for (endpoint in candidates) {
            try {
                if (token.isBlank() || tokenEndpoint != endpoint) {
                    token = bootstrapGuestAt(endpoint)
                    tokenEndpoint = endpoint
                }
                return streamAt(endpoint, body, token, uiConversationId, uiTemporary, uiGeneration, requestStartedAt).also { rememberReachable(endpoint) }
            } catch (error: NexusHttpException) {
                failure = error
                if (BuildConfig.DEBUG) android.util.Log.w("NexusConnection", "Stream HTTP ${error.statusCode}")
                val occupiedSession = error.statusCode == 429 && error.message.orEmpty().contains("impegnato", ignoreCase = true)
                if (error.statusCode == 401 || occupiedSession) {
                    try {
                        token = bootstrapGuestAt(endpoint)
                        tokenEndpoint = endpoint
                        return streamAt(endpoint, body, token, uiConversationId, uiTemporary, uiGeneration, requestStartedAt).also { rememberReachable(endpoint) }
                    } catch (retryError: Exception) { failure = retryError; if (BuildConfig.DEBUG) android.util.Log.w("NexusConnection", "Session refresh failed: ${retryError.javaClass.simpleName}") }
                }
            } catch (error: Exception) { failure = error; if (BuildConfig.DEBUG) android.util.Log.w("NexusConnection", "Stream failed: ${error.javaClass.simpleName}") }
        }
        persistStreamDiagnostics(requestStartedAt, 0L, 0, 0, false)
        throw failure ?: IllegalStateException("Nessun endpoint NexusNXS configurato.")
    }

    private fun bootstrapGuestAt(endpoint: String): String {
        var installationId = prefs.getString("installationId", "").orEmpty()
        if (installationId.isBlank()) {
            installationId = java.util.UUID.randomUUID().toString()
            prefs.edit { putString("installationId", installationId) }
        }
        val boot = httpAt(endpoint, "/api/guest/bootstrap", JSONObject().put("installationId", installationId).put("deviceName", android.os.Build.MODEL), "")
        explicitRemoteCapabilities(boot)?.let { (remoteWork, pairing) ->
            applyRemoteCapabilities(remoteWork, pairing)
        }
        val token = boot.optString("token")
        if (token.isBlank()) throw IllegalStateException(boot.optString("error", "Sessione NexusNXS non disponibile."))
        secureTokens.write("guestToken", token)
        prefs.edit { putString("guestTokenEndpoint", endpoint) }
        return token
    }

    private fun explicitRemoteCapabilities(payload: JSONObject): Pair<Boolean, Boolean>? {
        val source = payload.optJSONObject("capabilities") ?: payload
        if (!source.has("remoteWork") && !source.has("pairing")) return null
        return source.optBoolean("remoteWork", false) to source.optBoolean("pairing", false)
    }

    /**
     * Il servizio NexusNXS autenticato pubblica soltanto l'origin Tailscale del
     * relay e la versione del contratto. Il relay deve poi autenticare a sua
     * volta il dispositivo prima che qualsiasi controllo compaia nell'app.
     */
    private fun explicitWakeRelayDescriptor(payload: JSONObject): WakeRelayDescriptor? {
        val source = payload.optJSONObject("capabilities") ?: return null
        val wake = source.optJSONObject("wakeRelay") ?: return null
        if (wake.optInt("protocolVersion", 0) != WAKE_RELAY_PROTOCOL_VERSION) return null
        val endpoint = trustedWakeRelayEndpoint(wake.optString("endpoint")) ?: return null
        return WakeRelayDescriptor(endpoint = endpoint, pairing = wake.optBoolean("pairing", false))
    }

    private fun applyWakeRelayDescriptor(descriptor: WakeRelayDescriptor) {
        val previous = wakeRelayEndpoint
        if (previous.isNotBlank() && previous != descriptor.endpoint) {
            secureTokens.clear("wakeToken")
            prefs.edit { remove("wakeTokenRotatedAt") }
        }
        secureTokens.write("wakeRelayEndpoint", descriptor.endpoint)
        prefs.edit { putBoolean("wakeRelayPairing", descriptor.pairing) }
        val paired = secureTokens.read("wakeToken").isNotBlank()
        postUi {
            state = state.copy(
                wakePairingAvailable = descriptor.pairing && !paired,
                wakeStatus = if (paired) state.wakeStatus else nexusCopy("Relay privato disponibile", "Private relay available")
            )
        }
        if (paired) loadWakeCapabilities(force = true)
    }

    /**
     * Uno status autenticato che non pubblica piu la capability revoca anche la
     * superficie locale. Token e origin non restano utilizzabili in modo stale.
     */
    private fun clearWakeRelayAdvertisement() {
        secureTokens.clear("wakeToken")
        secureTokens.clear("wakeRelayEndpoint")
        prefs.edit {
            remove("wakeTokenRotatedAt")
            remove("wakeRelayPairing")
        }
        postUi {
            state = state.copy(
                wakePairingAvailable = false,
                wakeAvailable = false,
                wakeConnected = false,
                wakeTargets = emptyList(),
                wakeSelectedTarget = "",
                wakeTicketId = "",
                wakePreview = "",
                wakeRisk = "",
                wakeBusy = false,
                wakeAwaiting = false,
                wakeStatus = ""
            )
        }
    }

    private fun applyRemoteCapabilities(remoteWork: Boolean, pairing: Boolean) {
        if (!remoteWork && activeWorkOperationId.isNotBlank()) requestActiveWorkCancellation()
        if (!remoteWork) prefs.edit { putBoolean("workMode", false) }
        val restored = if (remoteWork) runCatching { JSONObject(secureTokens.read("workProposal")) }.getOrNull()
            ?.takeIf { System.currentTimeMillis() - it.optLong("savedAt") <= SESSION_RESUME_WINDOW_MS } else null
        postUi {
            val nextScreen = when {
                !remoteWork && state.screen in setOf(NexusScreen.PROJECTS, NexusScreen.SCHEDULED) -> NexusScreen.CHAT
                !pairing && !state.wakePairingAvailable && !state.wakeAvailable && state.screen == NexusScreen.REMOTE -> NexusScreen.CHAT
                else -> state.screen
            }
            state = state.copy(
                screen = nextScreen,
                work = remoteWork && state.work,
                pairing = pairing && state.pairing,
                remoteWorkAvailable = remoteWork,
                pairingAvailable = pairing,
                capabilitiesChecked = true,
                workTicketId = restored?.optString("ticket").orEmpty(),
                workPreview = restored?.optString("preview").orEmpty(),
                workRisk = restored?.optString("risk").orEmpty()
            )
            // Un token remoto preesistente resta cifrato, ma non viene mai usato
            // finché il server autenticato non dichiara esplicitamente il pairing.
            if (pairing) loadDevices()
        }
    }

    private fun refreshRemoteCapabilities() {
        if (capabilityProbeRunning || capabilityProbeCompleted || destroyed) return
        capabilityProbeRunning = true
        runTask {
            var completed = false
            try {
                for (endpoint in endpointCandidates()) {
                    if (destroyed) return@runTask
                    try {
                        var token = secureTokens.read("guestToken")
                        if (token.isBlank() || prefs.getString("guestTokenEndpoint", "").orEmpty() != endpoint) token = bootstrapGuestAt(endpoint)
                        val status = getJsonAt(endpoint, "/api/status", token)
                        val (remoteWork, pairing) = explicitRemoteCapabilities(status) ?: (false to false)
                        explicitWakeRelayDescriptor(status)?.let(::applyWakeRelayDescriptor)
                            ?: clearWakeRelayAdvertisement()
                        applyRemoteCapabilities(remoteWork, pairing)
                        rememberReachable(endpoint)
                        completed = true
                        break
                    } catch (_: Exception) { /* Prova il successivo endpoint configurato. */ }
                }
            } finally {
                capabilityProbeRunning = false
                if (completed) capabilityProbeCompleted = true
            }
        }
    }

    private fun routedMode(text: String, model: String): String {
        val sensitive = Regex("(?i)\\b(password|segreto|credenzial|token|api.?key|prompt.?injection|sicurezza|privacy|permess|elimina|cancella|sposta|rinomina|esegui|installa|disinstalla|registro|firewall|rete)\\b")
        val workAction = Regex("(?i)\\b(apri|avvia|crea|modifica|scrivi|salva|chiudi|ferma|controlla|verifica|cerca|scarica|carica|collega|disconnetti|riavvia|spegni|accendi)\\b")
        if (sensitive.containsMatchIn(text) || (state.work && workAction.containsMatchIn(text))) return "deep"
        if (model == "NexusNXS Rapido" || model == "Qwen3 8B" || model == "nexus-fast") return "fast"
        val explicitDepth = Regex("(?i)\\b(approfondisci|dettagliat[oa]|ragiona(?:mento)?\\s+(?:a fondo|profondo)|analisi\\s+(?:completa|approfondita)|passo\\s+passo|step\\s+by\\s+step|deep\\s+(?:analysis|reasoning)|in\\s+depth)\\b")
        val complex = Regex("(?i)\\b(codice|debug|errore|bug|sicurezza|password|segreto|api.?key|prompt.?injection|file|progetto|analizza|confronta|verifica|piano|architettura|database|test)\\b")
        // "Pro" indica la massima capacità disponibile, non l'obbligo di usare
        // sempre il percorso più lento. Il router sceglie deep solo quando la
        // richiesta lo richiede davvero; saluti e domande brevi restano fast.
        return if (text.length > 600 || explicitDepth.containsMatchIn(text) || complex.containsMatchIn(text) || text.count { it == '?' } > 1) "deep" else "fast"
    }

    private fun publicModelId(model: String): String = when (model) {
        "NexusNXS Pro", "Qwen3 14B", "nexus-deep" -> "nexus-deep"
        else -> "nexus-fast"
    }

    private fun ensureGuestToken(): String {
        val existing = secureTokens.read("guestToken")
        if (existing.isNotBlank()) return existing
        var installationId = prefs.getString("installationId", "").orEmpty()
        if (installationId.isBlank()) { installationId = java.util.UUID.randomUUID().toString(); prefs.edit { putString("installationId", installationId) } }
        val boot = http("/api/guest/bootstrap", JSONObject().put("installationId", installationId).put("deviceName", android.os.Build.MODEL), "")
        return boot.optString("token").also { if (it.isBlank()) throw IllegalStateException(boot.optString("error")); secureTokens.write("guestToken", it) }
    }

    private fun streamAt(base: String, body: JSONObject, token: String, uiConversationId: String, uiTemporary: Boolean, uiGeneration: Long, requestStartedAt: Long): String {
        val connection = openTrackedConnection(base.trimEnd('/') + "/api/guest/messages/stream")
        connection.instanceFollowRedirects = false
        try {
            activeConnection = connection
            connection.requestMethod = "POST"; connection.connectTimeout = 3_500; connection.readTimeout = 240_000; connection.doOutput = true
            connection.setRequestProperty("Accept", "application/x-ndjson"); connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) throw NexusHttpException(responseCode, connection.errorStream?.bufferedReader()?.readText().orEmpty())
            val answer = StringBuilder()
            var lastUiUpdate = 0L
            var firstTokenAt = 0L
            var streamedTokenCount = 0
            val activeDisplay = getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
            // Una singola pubblicazione per frame evita di ricomporre tutto il Markdown
            // più spesso di quanto il display possa realmente mostrare.
            val uiFrameMs = if ((activeDisplay?.refreshRate ?: 60f) >= 90f) 11L else 16L
            connection.inputStream.bufferedReader().useLines { lines -> lines.forEach { line ->
                if (line.isBlank()) return@forEach
                val event = JSONObject(line)
                when (event.optString("type")) {
                    "token" -> {
                        answer.append(event.optString("token"))
                        streamedTokenCount++
                        val now = SystemClock.uptimeMillis()
                        if (firstTokenAt == 0L) firstTokenAt = SystemClock.elapsedRealtime()
                        // Mantiene la risposta agganciata al refresh del display: il vecchio
                        // limite a 25 fps faceva sembrare la battitura artificiosamente lenta.
                        if (now - lastUiUpdate >= uiFrameMs) {
                            lastUiUpdate = now
                            publishStreamUi(uiConversationId, uiTemporary, uiGeneration, answer.toString())
                        }
                    }
                    "phase" -> event.optJSONObject("activity")?.optString("text")?.let { phase ->
                        val localizedPhase = localizedServerActivity(phase)
                        postUi { if (streamMatchesUi(uiConversationId, uiTemporary, uiGeneration)) state = state.copy(activity = localizedPhase) }
                    }
                    "complete" -> {
                        val complete = event.optString("message")
                        if (complete.isNotBlank()) {
                            answer.clear()
                            answer.append(complete)
                            clearPendingStreamUi()
                            postUi {
                                if (streamMatchesUi(uiConversationId, uiTemporary, uiGeneration)) {
                                    state = state.copy(streaming = complete, activity = nexusCopy("Risposta verificata", "Response verified"))
                                }
                            }
                        }
                    }
                    "error" -> throw IllegalStateException(event.optString("error"))
                }
            } }
            persistStreamDiagnostics(requestStartedAt, firstTokenAt, answer.length, streamedTokenCount, true)
            return answer.toString()
        } finally {
            if (activeConnection === connection) activeConnection = null
            closeTrackedConnection(connection)
        }
    }

    private fun persistStreamDiagnostics(startedAt: Long, firstTokenAt: Long, characters: Int, tokenCount: Int, success: Boolean) {
        val completedAt = SystemClock.elapsedRealtime()
        val firstTextMs = if (firstTokenAt > 0L) firstTokenAt - startedAt else completedAt - startedAt
        val streamingMs = (completedAt - if (firstTokenAt > 0L) firstTokenAt else startedAt).coerceAtLeast(1L)
        prefs.edit {
            putLong("stream.lastFirstTextMs", firstTextMs)
            putLong("stream.lastDurationMs", completedAt - startedAt)
            putInt("stream.lastCharacters", characters)
            putFloat("stream.lastTokensPerSecond", tokenCount * 1_000f / streamingMs)
            putBoolean("stream.lastSuccess", success)
        }
    }

    private fun guestMessage(text: String, model: String): String {
        var token = secureTokens.read("guestToken")
        var installationId = prefs.getString("installationId", "").orEmpty()
        if (installationId.isBlank()) {
            installationId = java.util.UUID.randomUUID().toString()
            prefs.edit { putString("installationId", installationId) }
        }
        val bootstrapBody = JSONObject().put("installationId", installationId).put("deviceName", android.os.Build.MODEL)
        if (token.isBlank()) {
            val boot = http("/api/guest/bootstrap", bootstrapBody, "")
            token = boot.optString("token")
            if (token.isBlank()) return boot.optString("error", "Impossibile avviare la sessione locale.")
            secureTokens.write("guestToken", token)
        }
        val history = JSONArray().also { a -> state.turns.takeLast(20).forEach { a.put(JSONObject().put("role", it.role).put("content", it.content)) } }
        val body = JSONObject().put("text", text).put("history", history).put("mode", routedMode(text, model)).put("model", publicModelId(model))
        var result = http("/api/guest/messages", body, token)
        if (result.optString("error").contains("scaduta", true)) {
            prefs.edit { remove("guestToken") }
            val boot = http("/api/guest/bootstrap", bootstrapBody, "")
            token = boot.optString("token")
            if (token.isBlank()) return boot.optString("error", nexusCopy("Impossibile rinnovare la sessione locale.", "Unable to renew the local session."))
            secureTokens.write("guestToken", token)
            result = http("/api/guest/messages", body, token)
        }
        return result.optString("message").ifBlank { result.optString("error", nexusCopy("Nessuna risposta disponibile.", "No response is available.")) }
    }

    private fun pair(code: String) {
        if (!code.matches(Regex("\\d{6}"))) { state = state.copy(status = nexusCopy("Codice non valido", "Invalid code")); return }
        state = state.copy(busy = true, status = nexusCopy("Collegamento…", "Connecting…"))
        runTask {
            val result = try { http("/api/pair", JSONObject().put("code", code).put("deviceName", android.os.Build.MODEL).put("scope", "remote"), "") } catch (_: Exception) { JSONObject().put("error", nexusCopy("PC non raggiungibile", "PC unreachable")) }
            if (destroyed) return@runTask
            postUi {
                val token = result.optString("token")
                if (token.isNotBlank()) { secureTokens.write("remoteToken", token); prefs.edit { putLong("remoteTokenRotatedAt", System.currentTimeMillis()) }; loadDevices() }
                state = state.copy(busy = false, pairing = token.isBlank(), status = if (token.isBlank()) result.optString("error", nexusCopy("Errore", "Error")) else nexusCopy("Workstation associata", "Workstation paired"), connection = if (token.isBlank()) NexusConnection.OFFLINE else NexusConnection.ONLINE)
            }
        }
    }

    private fun probeConnection() {
        if (connectionProbeRunning) return
        connectionProbeRunning = true
        runTask {
            try {
                val endpoints = endpointCandidates()
                val probes = endpoints.associateWith { base -> CompletableFuture.supplyAsync({
                    try { probeReady(base) } catch (_: Exception) { false }
                }, backgroundExecutor) }
                val deadline = SystemClock.uptimeMillis() + 2_100L
                var winner: String? = null
                while (!destroyed && winner == null && SystemClock.uptimeMillis() < deadline) {
                    winner = endpoints.firstOrNull { probes.getValue(it).getNow(false) }
                    if (winner == null && probes.values.any { !it.isDone }) Thread.sleep(35)
                    else if (winner == null) break
                }
                probes.values.forEach { if (!it.isDone) it.cancel(true) }
                val reachable = winner != null
                if (winner != null) rememberReachable(winner)
                postUi {
                    if (!state.busy && !state.temporary) state = state.copy(
                        status = if (reachable) "Online" else if (store.pendingCount() > 0) nexusCopy("Server NexusNXS non raggiungibili · ${store.pendingCount()} in coda", "NexusNXS servers unreachable · ${store.pendingCount()} queued") else nexusCopy("Server NexusNXS non raggiungibili", "NexusNXS servers unreachable"),
                        connection = if (reachable) NexusConnection.ONLINE else NexusConnection.OFFLINE,
                        pendingCount = store.pendingCount(),
                        // Un probe riuscito chiude soltanto errori di trasporto ormai
                        // obsoleti; errori di contenuto, sicurezza o autorizzazione restano.
                        error = if (reachable && state.error?.isTransportFailure() == true) null else state.error
                    )
                }
                // In primo piano una coda precedente non deve occupare la sessione
                // mentre l'utente invia un nuovo messaggio. Il recupero resta
                // automatico in background e manuale dal relativo pulsante.
                if (reachable) { refreshRemoteCapabilities(); if (!appVisible) retryPendingRequests() }
            } finally {
                connectionProbeRunning = false
            }
        }
    }

    private fun refreshModels() = runTask {
        var rows: JSONArray? = null
        for (endpoint in endpointCandidates()) {
            if (destroyed) return@runTask
            rows = runCatching {
                val connection = openTrackedConnection(endpoint.trimEnd('/') + "/api/models")
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 2_500; connection.readTimeout = 2_500
                try {
                    if (connection.responseCode !in 200..299) error("HTTP ${connection.responseCode}")
                    connection.inputStream.bufferedReader().use { JSONObject(it.readText()).optJSONArray("models") }
                } finally { closeTrackedConnection(connection) }
            }.getOrNull()
            if (rows != null) { rememberReachable(endpoint); break }
        }
        rows ?: return@runTask
        val models = buildList { for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { item ->
            val id = item.optString("id"); if (id.contains("embed", true)) return@let
            val size = item.optLong("size")
            val display = when {
                id.equals("nexus-deep", true) -> "NexusNXS Pro"
                id.equals("nexus-fast", true) -> "NexusNXS Rapido"
                id.contains("vision", true) || id.contains("vl", true) -> "NexusNXS Visione"
                id.contains("code", true) || id.contains("coder", true) -> "NexusNXS Codice"
                id.contains("14b", true) || size >= 10_000_000_000L -> "NexusNXS Pro"
                id.contains("8b", true) || size >= 5_000_000_000L -> "NexusNXS Rapido"
                else -> "NexusNXS Compatto"
            }
            add(ModelRow(id, display, size, item.optBoolean("available", true)))
        } }
        if (models.isNotEmpty()) postUi { state = state.copy(models = models.distinctBy { it.name }) }
    }

    private fun retryPendingRequests() {
        if (retryingPending || state.busy || state.temporary) return
        retryingPending = true
        postUi { if (store.pendingCount() > 0) state = state.copy(status = nexusCopy("Sincronizzazione…", "Syncing…"), connection = NexusConnection.ONLINE, pendingCount = store.pendingCount()) }
        runTask {
            try {
                while (!destroyed) {
                    val pending = store.nextPendingRequest() ?: break
                    val requestId = pending.optString("id")
                    val conversationId = pending.optString("conversationId")
                    val prompt = pending.optString("prompt")
                    val model = pending.optString("model", "NexusNXS Rapido")
                    val attachment = pending.optString("attachment").takeIf(String::isNotBlank)?.let { runCatching { JSONObject(it) }.getOrNull() }
                    store.markPendingAttempt(requestId)
                    val allTurns = store.get(conversationId)?.optJSONArray("turns")?.toTurns().orEmpty()
                    val history = allTurns.dropLastWhile { it.role != "user" }.dropLast(1)
                    val answer = try { guestStream(prompt, model, history, attachment, requestId) } catch (_: Exception) { break }
                    if (destroyed) break
                    if (answer.isBlank()) break
                    store.addTurn(conversationId, "assistant", answer)
                    store.completePendingRequest(requestId)
                    postUi {
                        if (state.conversationId == conversationId) state = state.copy(turns = store.get(conversationId)?.optJSONArray("turns")?.toTurns().orEmpty())
                        state = state.copy(pendingCount = store.pendingCount(), status = if (store.pendingCount() == 0) "Online" else "Sincronizzazione…", connection = NexusConnection.ONLINE)
                        refreshChats()
                    }
                }
            } finally { retryingPending = false }
        }
    }

    private fun loadDevices() {
        if (!state.pairingAvailable) return
        var token = secureTokens.read("remoteToken")
        if (token.isBlank()) return
        runTask {
            try {
                if (System.currentTimeMillis() - prefs.getLong("remoteTokenRotatedAt", 0L) > 86_400_000L) {
                    val rotated = http("/api/session/rotate", JSONObject(), token)
                    if (destroyed) return@runTask
                    rotated.optString("token").takeIf { it.isNotBlank() }?.let {
                        token = it
                        secureTokens.write("remoteToken", it); prefs.edit { putLong("remoteTokenRotatedAt", rotated.optLong("rotatedAt", System.currentTimeMillis())) }
                    }
                }
                val payload = getJson("/api/devices", token)
                if (destroyed) return@runTask
                val rows = payload.optJSONArray("devices") ?: JSONArray()
                val devices = buildList { for (i in 0 until rows.length()) rows.optJSONObject(i)?.let { add(DeviceRow(it.optString("id"), it.optString("name"), it.optString("scope"), it.optLong("lastSeenAt"), it.optBoolean("current"))) } }
                postUi {
                    state = state.copy(
                        devices = devices,
                        wakeAwaiting = false,
                        wakeStatus = if (state.wakeAwaiting) nexusCopy("Workstation raggiungibile", "Workstation reachable") else state.wakeStatus
                    )
                }
            } catch (_: Exception) { /* Il gateway precedente resta compatibile fino al prossimo riavvio naturale. */ }
        }
    }

    private fun clearWakeSession() {
        secureTokens.clear("wakeToken")
        prefs.edit { remove("wakeTokenRotatedAt") }
        val pairingAllowed = prefs.getBoolean("wakeRelayPairing", false) && wakeRelayEndpoint.isNotBlank()
        state = state.copy(
            wakePairingAvailable = pairingAllowed,
            wakeAvailable = false,
            wakeConnected = false,
            wakeTargets = emptyList(),
            wakeSelectedTarget = "",
            wakeTicketId = "",
            wakePreview = "",
            wakeRisk = "",
            wakeBusy = false,
            wakeAwaiting = false,
            wakeStatus = nexusCopy("Associazione del relay richiesta", "Relay pairing required")
        )
    }

    private fun pairWakeRelay(code: String) {
        if (!appVisible || !code.matches(Regex("\\d{6}")) || wakeRelayEndpoint.isBlank()) {
            state = state.copy(wakeStatus = nexusCopy("Codice non valido", "Invalid code"))
            return
        }
        state = state.copy(wakeBusy = true, wakeStatus = nexusCopy("Associo il relay privato…", "Pairing private relay…"))
        runTask {
            val result = runCatching {
                wakePost(
                    "/api/pair",
                    JSONObject().put("code", code).put("deviceName", android.os.Build.MODEL.take(80)).put("scope", "wake"),
                    ""
                )
            }
            if (destroyed) return@runTask
            postUi {
                val payload = result.getOrNull()
                val token = payload?.optString("token").orEmpty()
                val deviceScope = payload?.optJSONObject("device")?.optString("scope").orEmpty()
                val valid = token.matches(Regex("[A-Za-z0-9_-]{32,160}")) && deviceScope == "wake"
                if (valid) {
                    secureTokens.write("wakeToken", token)
                    prefs.edit { putLong("wakeTokenRotatedAt", System.currentTimeMillis()) }
                    state = state.copy(wakeBusy = false, wakePairingAvailable = false, wakeStatus = nexusCopy("Relay associato · verifico le capacità", "Relay paired · checking capabilities"))
                    loadWakeCapabilities(force = true)
                } else {
                    state = state.copy(wakeBusy = false, wakePairingAvailable = true, wakeStatus = result.exceptionOrNull()?.message?.take(160) ?: nexusCopy("Associazione non riuscita", "Pairing failed"))
                }
            }
        }
    }

    private fun parseWakeTargets(payload: JSONObject): List<WakeTargetRow>? {
        if (!payload.has("available") || !payload.has("requiresConfirmation") || !payload.has("arbitraryDestinations")) return null
        if (!payload.optBoolean("available", false)) return emptyList()
        if (!payload.optBoolean("requiresConfirmation", false) || payload.optBoolean("arbitraryDestinations", true)) return null
        val rows = payload.optJSONArray("targets") ?: return null
        if (rows.length() !in 1..8) return null
        val targets = buildList {
            for (index in 0 until rows.length()) {
                val item = rows.optJSONObject(index) ?: return null
                val id = item.optString("id").lowercase(Locale.ROOT)
                val label = item.optString("label").replace(Regex("[\\p{Cntrl}]"), " ").trim().take(80)
                if (!id.matches(Regex("[a-z0-9][a-z0-9_-]{1,47}")) || label.isBlank()) return null
                add(WakeTargetRow(id, label))
            }
        }
        return targets.takeIf { values -> values.distinctBy { it.id }.size == values.size }
    }

    private fun loadWakeCapabilities(force: Boolean = false) {
        if (destroyed || wakeProbeRunning || !::secureTokens.isInitialized || !appVisible && !force) return
        val endpoint = wakeRelayEndpoint
        var token = secureTokens.read("wakeToken")
        if (endpoint.isBlank() || token.isBlank()) return
        wakeProbeRunning = true
        runTask {
            try {
                if (System.currentTimeMillis() - prefs.getLong("wakeTokenRotatedAt", 0L) > WAKE_TOKEN_ROTATION_MS) {
                    val rotated = wakePost("/api/session/rotate", JSONObject(), token)
                    val nextToken = rotated.optString("token")
                    if (!nextToken.matches(Regex("[A-Za-z0-9_-]{32,160}"))) error("Rotazione sessione non valida.")
                    token = nextToken
                    secureTokens.write("wakeToken", nextToken)
                    prefs.edit { putLong("wakeTokenRotatedAt", rotated.optLong("rotatedAt", System.currentTimeMillis())) }
                }
                val payload = wakeGet("/api/wake/capabilities", token)
                val targets = parseWakeTargets(payload) ?: error("Contratto relay non compatibile.")
                postUi {
                    if (targets.isEmpty()) {
                        state = state.copy(wakeAvailable = false, wakeConnected = true, wakeTargets = emptyList(), wakeSelectedTarget = "", wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Nessuna workstation autorizzata sul relay", "No workstation is authorized on the relay"))
                    } else {
                        val selected = state.wakeSelectedTarget.takeIf { current -> targets.any { it.id == current } } ?: targets.first().id
                        state = state.copy(
                            wakePairingAvailable = false,
                            wakeAvailable = true,
                            wakeConnected = true,
                            wakeTargets = targets,
                            wakeSelectedTarget = selected,
                            wakeStatus = if (state.wakeAwaiting) state.wakeStatus else nexusCopy("Relay privato pronto", "Private relay ready")
                        )
                    }
                }
            } catch (error: Exception) {
                postUi {
                    when {
                        error is NexusHttpException && error.statusCode == 401 -> clearWakeSession()
                        error is java.io.IOException -> state = state.copy(wakeConnected = false, wakeStatus = nexusCopy("Relay privato non raggiungibile · riconnessione automatica", "Private relay unavailable · reconnecting automatically"))
                        else -> state = state.copy(wakeAvailable = false, wakeConnected = false, wakeTargets = emptyList(), wakeSelectedTarget = "", wakeTicketId = "", wakePreview = "", wakeRisk = "", wakeStatus = nexusCopy("Relay privato non compatibile", "Private relay is incompatible"))
                    }
                }
            } finally {
                wakeProbeRunning = false
            }
        }
    }

    private fun wakeGet(path: String, token: String): JSONObject = wakeRequest("GET", path, null, token)

    private fun wakePost(path: String, body: JSONObject, token: String): JSONObject = wakeRequest("POST", path, body, token)

    private fun wakeRequest(method: String, path: String, body: JSONObject?, token: String): JSONObject {
        val endpoint = wakeRelayEndpoint.ifBlank { throw IllegalStateException("Relay privato non configurato.") }
        require(path in setOf("/api/pair", "/api/session/rotate", "/api/wake/capabilities", "/api/wake/plan", "/api/wake/execute"))
        val connection = openTrackedConnection(endpoint + path)
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.connectTimeout = 3_500
            connection.readTimeout = 8_000
            connection.setRequestProperty("Accept", "application/json")
            if (token.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val result = runCatching { JSONObject(payload) }.getOrElse { JSONObject().put("error", "HTTP $status") }
            if (status !in 200..299) throw NexusHttpException(status, result.optString("error", "HTTP $status"))
            return result
        } finally {
            closeTrackedConnection(connection)
        }
    }

    private fun getJson(path: String, token: String): JSONObject {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            try { return getJsonAt(endpoint, path, token).also { rememberReachable(endpoint) } }
            catch (error: Exception) { failure = error }
        }
        throw failure ?: IllegalStateException("Nessun endpoint NexusNXS configurato.")
    }

    private fun getJsonAt(base: String, path: String, token: String): JSONObject {
        val connection = openTrackedConnection(base.trimEnd('/') + path)
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "GET"; connection.connectTimeout = 5_000; connection.readTimeout = 8_000
            connection.setRequestProperty("Accept", "application/json"); connection.setRequestProperty("Authorization", "Bearer $token")
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val value = JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            if (status !in 200..299) throw IllegalStateException(value.optString("error", "HTTP $status"))
            return value
        } finally { closeTrackedConnection(connection) }
    }

    private fun http(path: String, body: JSONObject, token: String): JSONObject {
        var failure: Exception? = null
        for (endpoint in endpointCandidates()) {
            try {
                return httpAt(endpoint, path, body, token).also {
                    rememberReachable(endpoint)
                    postUi { state = state.copy(status = if (endpoint == BuildConfig.NEXUS_LAN_URL) "Online · rete locale" else "Online", connection = NexusConnection.ONLINE) }
                }
            } catch (error: Exception) { failure = error }
        }
        throw failure ?: IllegalStateException("Nessun endpoint NexusNXS configurato.")
    }

    private fun httpAt(base: String, path: String, body: JSONObject, token: String): JSONObject {
        val connection = openTrackedConnection(base.trimEnd('/') + path)
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"; connection.connectTimeout = 3_500; connection.readTimeout = 240_000; connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            if (token.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val result = JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            if (status !in 200..299) throw IllegalStateException(result.optString("error", "HTTP $status"))
            return result
        } finally { closeTrackedConnection(connection) }
    }

    private fun isTrustedDeepLink(uri: Uri): Boolean = runCatching {
        if (!uri.isHierarchical || uri.userInfo != null || uri.fragment != null) return@runCatching false
        if (uri.queryParameterNames.any { it !in setOf("pair", "server") }) return@runCatching false
        if (uri.getQueryParameters("pair").size != 1 || !uri.getQueryParameter("pair").orEmpty().matches(Regex("\\d{6}"))) return@runCatching false
        if (uri.getQueryParameters("server").size > 1) return@runCatching false
        when {
            uri.scheme.equals("nexus", ignoreCase = true) ->
                uri.host.equals("remote", ignoreCase = true) && uri.port == -1 && (uri.path.isNullOrEmpty() || uri.path == "/")
            uri.scheme.equals("https", ignoreCase = true) -> {
                val incomingOrigin = normalizeHttpsEndpoint("https://${uri.encodedAuthority}")
                incomingOrigin != null && incomingOrigin == normalizeHttpsEndpoint(BuildConfig.NEXUS_URL) && (uri.path.isNullOrEmpty() || uri.path == "/")
            }
            else -> false
        }
    }.getOrDefault(false)

    private fun handleDeepLink(uri: Uri): Boolean {
        if (!isTrustedDeepLink(uri)) return false
        val requestedServer = uri.getQueryParameter("server")
        if (requestedServer != null) {
            val endpoint = trustedEndpoint(requestedServer) ?: return false
            prefs.edit { putString("preferredServer", endpoint) }
        }
        val code = uri.getQueryParameter("pair") ?: return false
        state = state.copy(screen = NexusScreen.REMOTE, pairing = true)
        pair(code)
        return true
    }

    private fun handleIncomingIntent(incoming: Intent?) {
        incoming ?: return
        if (incoming.action == Intent.ACTION_ASSIST) {
            state = state.copy(
                screen = NexusScreen.CHAT,
                work = false,
                assistantOverlay = true,
                assistantInvocation = System.currentTimeMillis()
            )
            onAssistantPresentationChanged()
            incoming.replaceExtras(Bundle())
            incoming.data = null
            incoming.action = null
            return
        }
        if (incoming.action == Intent.ACTION_VIEW) {
            incoming.data?.let(::handleDeepLink)
            incoming.data = null
            incoming.action = null
            return
        }
        if (incoming.action != Intent.ACTION_SEND) return
        val declaredMime = incoming.type.orEmpty().lowercase(Locale.ROOT)
        fun allowedMime(value: String) = value.startsWith("text/") || value.startsWith("image/") || value == "application/pdf"
        if (!allowedMime(declaredMime)) { incoming.action = null; return }
        val sharedText = runCatching { incoming.getStringExtra(Intent.EXTRA_TEXT).orEmpty().trim() }.getOrDefault("")
        val extraStream = runCatching { if (android.os.Build.VERSION.SDK_INT >= 33) incoming.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) }.getOrNull()
        val clip = runCatching { incoming.clipData }.getOrNull()
        val stream = extraStream ?: clip?.takeIf { it.itemCount == 1 }?.getItemAt(0)?.uri
        if (stream != null && !stream.scheme.equals("content", ignoreCase = true)) { incoming.action = null; return }
        val detectedMime = stream?.let { runCatching { contentResolver.getType(it).orEmpty().lowercase(Locale.ROOT) }.getOrDefault("") }.orEmpty()
        if (stream != null && detectedMime.isNotBlank() && !allowedMime(detectedMime)) { incoming.action = null; return }
        val mime = detectedMime.ifBlank { declaredMime }
        state = state.copy(screen = NexusScreen.CHAT, work = false, temporary = false, draft = sharedText.take(80_000).ifBlank { if (stream != null) "Analizza questo contenuto" else state.draft })
        if (stream != null) {
            val name = stream.lastPathSegment?.substringAfterLast('/')?.replace(Regex("[\\p{Cntrl}]"), "")?.take(120).orEmpty().ifBlank { "Contenuto condiviso" }
            dispatch("attach", JSONObject().put("name", name).put("uri", stream.toString()).put("mime", mime).toString())
        }
        incoming.replaceExtras(Bundle())
        incoming.data = null
        incoming.action = null
    }
}

private fun String.normalizedExternalText() = replace(Regex("%20", RegexOption.IGNORE_CASE), " ")
private fun relativeTimeLabel(timestamp: Long, italian: Boolean = true): String {
    val minutes = ((System.currentTimeMillis() - timestamp).coerceAtLeast(0) / 60_000).toInt()
    return when { minutes < 1 -> if (italian) "ora" else "now"; minutes < 60 -> "${minutes}m"; minutes < 1_440 -> "${minutes / 60}h"; minutes < 10_080 -> "${minutes / 1_440}${if (italian) "g" else "d"}"; else -> "${minutes / 10_080}${if (italian) "sett" else "w"}" }
}

private fun chatGroupLabel(timestamp: Long, italian: Boolean = true): String {
    val days = ((System.currentTimeMillis() - timestamp).coerceAtLeast(0) / 86_400_000).toInt()
    return when { days == 0 -> if (italian) "Oggi" else "Today"; days == 1 -> if (italian) "Ieri" else "Yesterday"; days < 7 -> if (italian) "Ultimi 7 giorni" else "Last 7 days"; days < 30 -> if (italian) "Ultimi 30 giorni" else "Last 30 days"; else -> if (italian) "Precedenti" else "Earlier" }
}

private fun JSONArray.toChatRows() = buildList {
    for (i in 0 until length()) optJSONObject(i)?.let {
        val title = it.optString("title").normalizedExternalText()
        val preview = it.optString("preview").normalizedExternalText()
        if (preview.isNotBlank() || title != "Nuova conversazione") add(ChatRow(it.optString("id"), title, preview, it.optLong("updatedAt"), it.optBoolean("pinned")))
    }
}

private fun JSONArray?.toTurns() = buildList {
    if (this@toTurns != null) for (i in 0 until length()) optJSONObject(i)?.let {
        val artifacts = buildList { it.optJSONArray("artifacts")?.let { rows -> for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { artifact -> add(WorkArtifact(artifact.optString("title"), artifact.optString("subtitle"), artifact.optString("language", "text"), artifact.optString("content").take(48_000), artifact.optInt("added"), artifact.optInt("removed"))) } } }
        add(Turn(it.optString("role"), it.optString("content").normalizedExternalText(), artifacts))
    }
}

@Composable private fun NexusTheme(content: @Composable () -> Unit) {
    val metrics = rememberNexusMetrics()
    val cosmicScene = remember { CosmicSceneState() }
    CompositionLocalProvider(LocalNexusMetrics provides metrics, LocalCosmicScene provides cosmicScene) { MaterialTheme(
    colorScheme = darkColorScheme(primary = Cyan, background = Ink, surface = Surface, surfaceVariant = Surface2, outline = Hairline, onPrimary = Color(0xFF002223), onBackground = Ice, onSurface = Ice, onSurfaceVariant = Mist),
    typography = Typography(
        displaySmall = TextStyle(fontFamily = NexusSans, fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.72).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        headlineMedium = TextStyle(fontFamily = NexusSans, fontSize = 27.sp, lineHeight = 33.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.52).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        titleLarge = TextStyle(fontFamily = NexusSans, fontSize = 23.sp, lineHeight = 29.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.34).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        titleMedium = TextStyle(fontFamily = NexusSans, fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-.12).sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        bodyLarge = TextStyle(fontFamily = NexusSans, fontSize = 16.sp, lineHeight = 25.sp, letterSpacing = 0.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        bodyMedium = TextStyle(fontFamily = NexusSans, fontSize = 14.sp, lineHeight = 21.sp, letterSpacing = 0.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        bodySmall = TextStyle(fontFamily = NexusSans, fontSize = 12.sp, lineHeight = 18.sp, letterSpacing = 0.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        labelLarge = TextStyle(fontFamily = NexusSans, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        labelMedium = TextStyle(fontFamily = NexusSans, fontSize = 12.sp, lineHeight = 17.sp, fontWeight = FontWeight.Medium, platformStyle = PlatformTextStyle(includeFontPadding = false))
    ),
    content = content
    ) }
}

/**
 * Superficie pubblica istantanea: nessuna navigazione, nessun pannello e
 * nessuna cronologia visibile. Il database cifrato continua a fornire memoria
 * conversazionale al Core senza trasformarsi in una sezione dell'interfaccia.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun NexusInstantApp(state: NexusUiState, dispatch: (String, String) -> Unit) {
    val context = LocalContext.current
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var remoteSettingsOpen by rememberSaveable { mutableStateOf(false) }
    var remotePairCode by rememberSaveable { mutableStateOf("") }
    var controlsAwake by remember { mutableStateOf(true) }
    var lastInteraction by remember { mutableStateOf(0L) }
    val accessibleControls = (context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? android.view.accessibility.AccessibilityManager)?.isTouchExplorationEnabled == true
    LaunchedEffect(lastInteraction, settingsOpen, accessibleControls) {
        controlsAwake = true
        if (!settingsOpen && !accessibleControls) {
            kotlinx.coroutines.delay(6_000)
            controlsAwake = false
        }
    }
    val metrics = LocalNexusMetrics.current
    val reduceMotion = state.reduceMotion || metrics.adaptiveReducedMotion || !ValueAnimator.areAnimatorsEnabled()
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val haptic = LocalHapticFeedback.current
    val focusRequester = remember { FocusRequester() }
    val coreConfiguration = LocalConfiguration.current
    val homeCoreDiameter = minOf(coreConfiguration.screenWidthDp * .98f, coreConfiguration.screenHeightDp * .78f, 1200f).dp
    var textMode by rememberSaveable { mutableStateOf(state.assistantEntry == "text") }
    var typedSession by rememberSaveable { mutableStateOf(state.assistantEntry.isNotBlank()) }
    // Una sessione microfono non deve mai essere ripristinata dal saved state
    // dopo un nuovo avvio o un ritorno dal task switcher.
    var voiceMode by remember { mutableStateOf(false) }
    var inlineVoiceListening by remember { mutableStateOf(false) }
    var inlineVoiceEnergy by remember { mutableFloatStateOf(0f) }
    var inlineVoiceStatus by remember { mutableStateOf("") }
    var inlineVoiceDetail by remember { mutableStateOf("") }
    var attachmentSheet by rememberSaveable { mutableStateOf(state.assistantEntry == "attachment") }
    val interactionAvailable = state.connection == NexusConnection.ONLINE
    LaunchedEffect(state.assistantEntry) {
        if (state.assistantEntry.isBlank()) return@LaunchedEffect
        typedSession = true
        textMode = state.assistantEntry == "text"
        attachmentSheet = state.assistantEntry == "attachment"
        dispatch("assistantEntryConsumed", "")
    }
    val instantSlashSuggestions = remember(state.draft, state.slashCommands) {
        val match = Regex("^/([^\\s]*)$").find(state.draft.trim())
        if (match == null) emptyList() else {
            val query = match.groupValues[1].lowercase(Locale.ROOT)
            (state.slashCommands + builtinSlashCommands())
                .distinctBy { it.name }
                .filter { query.isBlank() || it.name.startsWith(query) || it.label.lowercase(Locale.getDefault()).contains(query) }
                .take(4)
        }
    }

    LaunchedEffect(state.assistantInvocation, interactionAvailable) {
        if (state.assistantInvocation <= 0L) return@LaunchedEffect
        keyboard?.hide()
        focusManager.clearFocus(force = true)
        textMode = false
        typedSession = false
        attachmentSheet = false
        if (interactionAvailable) voiceMode = true else dispatch("probe", "")
    }

    LaunchedEffect(state.connection) {
        if (!interactionAvailable) {
            keyboard?.hide()
            focusManager.clearFocus(force = true)
            voiceMode = false
            attachmentSheet = false
        }
        while (true) {
            dispatch("probe", "")
            kotlinx.coroutines.delay(if (state.connection == NexusConnection.OFFLINE) 4_000 else 15_000)
        }
    }
    LaunchedEffect(textMode) {
        if (textMode) {
            voiceMode = false
            dispatch("stopSpeech", "")
            kotlinx.coroutines.delay(70)
            focusRequester.requestFocus()
            keyboard?.show()
        }
    }
    BackHandler(enabled = voiceMode || textMode || typedSession) {
        if (voiceMode) voiceMode = false
        else if (textMode) {
            keyboard?.hide()
            focusManager.clearFocus(force = true)
            textMode = false
        } else typedSession = false
    }

    Box(Modifier.fillMaxSize()) {
    Surface(color = Ink, contentColor = Ice, modifier = Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize()) {
        CosmicScene(Modifier.fillMaxSize())
        Box(
            Modifier.fillMaxSize().pointerInput(Unit) {
                awaitPointerEventScope {
                    var origin = androidx.compose.ui.geometry.Offset.Zero
                    var rejected = false
                    var opened = false
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        val change = event.changes.firstOrNull()
                        if (change != null && change.pressed && !change.previousPressed) { origin = change.position; rejected = false; opened = false }
                        if (event.changes.count { it.pressed } > 1) rejected = true
                        if (change != null && change.pressed) {
                            val delta = change.position - origin
                            if (kotlin.math.abs(delta.y) > 32.dp.toPx() || delta.x < -24.dp.toPx()) rejected = true
                            if (!rejected && !opened && delta.x > 80.dp.toPx() && delta.x > kotlin.math.abs(delta.y) * 2f) {
                                keyboard?.hide(); settingsOpen = true; opened = true
                            }
                        }
                        if (opened) event.changes.forEach { it.consume() }
                        if (event.changes.any { it.pressed }) lastInteraction = System.nanoTime()
                    }
                }
            }.statusBarsPadding().navigationBarsPadding().imePadding()
                .padding(horizontal = metrics.horizontalPadding).padding(top = 12.dp, bottom = 10.dp)
        ) {
            InstantConnectionMark(state.connection, Modifier.align(Alignment.TopEnd))
            AnimatedVisibility(controlsAwake, modifier = Modifier.align(Alignment.TopStart), enter = fadeIn(), exit = fadeOut()) {
                IconButton(onClick = { keyboard?.hide(); settingsOpen = true }, modifier = Modifier.size(48.dp).clip(CircleShape).background(Surface.copy(alpha = .8f))) { PremiumMenuGlyph() }
            }
            Column(
                Modifier.fillMaxSize().widthIn(max = 760.dp).align(Alignment.Center).padding(top = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                AnimatedContent(
                    targetState = typedSession,
                    transitionSpec = { nexusTransform(reduceMotion) },
                    modifier = Modifier.fillMaxSize(),
                    label = "instantInteractionMode"
                ) { written ->
                    if (written) Column(Modifier.fillMaxSize()) {
                        val historyState = rememberLazyListState()
                        LaunchedEffect(Unit) { historyState.scrollToItem(state.turns.size) }
                        val followLatest = !historyState.canScrollForward
                        LaunchedEffect(state.turns.size, state.streaming, state.busy) {
                            if (followLatest && !historyState.isScrollInProgress) historyState.scrollToItem(state.turns.size)
                        }
                        LazyColumn(
                            state = historyState,
                            modifier = Modifier.weight(1f).fillMaxWidth().conversationGlass(true, metrics.adaptiveReducedMotion),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 48.dp),
                            verticalArrangement = Arrangement.spacedBy(24.dp)
                        ) {
                            itemsIndexed(state.turns, key = { index, turn -> "instant-" + index + "-" + turn.role }) { _, turn ->
                                InstantWrittenExchange(
                                    latestPrompt = if (turn.role == "user") turn.content else "",
                                    latestAnswer = if (turn.role == "assistant") turn.content else "",
                                    error = null, centered = false, busy = false, activity = "",
                                    reduceMotion = reduceMotion, modifier = Modifier.fillMaxWidth()
                                )
                            }
                            item(key = "instant-stream") {
                                if (state.busy || state.error != null || state.turns.isEmpty()) InstantWrittenExchange(
                                    latestPrompt = "", latestAnswer = if (state.busy) state.streaming else "",
                                    error = state.error, centered = false, busy = state.busy, activity = state.activity,
                                    reduceMotion = reduceMotion, modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                        AnimatedVisibility(state.attachment != null, enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
                            AttachmentPreview(state.composerState(), { dispatch("attach", "") })
                        }
                        // Keep one text field during IME movement. Cross-fading
                        // two composer trees briefly duplicated/clipped its shell.
                        Box(Modifier.fillMaxWidth()) {
                            if (textMode) Column(Modifier.fillMaxWidth()) {
                        AnimatedVisibility(instantSlashSuggestions.isNotEmpty(), enter = nexusEnter(reduceMotion), exit = nexusExit(reduceMotion)) {
                            Surface(
                                color = Surface.copy(alpha = .985f),
                                shape = RoundedCornerShape(20.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .14f)),
                                shadowElevation = 10.dp,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                            ) {
                                Column(Modifier.padding(7.dp)) {
                                    Row(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(nexusCopy("COMANDI NEXUSNXS", "NEXUSNXS COMMANDS"), color = Mist, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.1.sp, modifier = Modifier.weight(1f))
                                        Text(nexusCopy("Tocca per inserire", "Tap to insert"), color = Mist, fontSize = 12.sp)
                                    }
                                    instantSlashSuggestions.forEach { command ->
                                        Row(
                                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { dispatch("draft", "/${command.name} ") }.padding(horizontal = 11.dp, vertical = 9.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("/${command.name}", color = Cyan, fontSize = 13.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, modifier = Modifier.widthIn(min = 88.dp))
                                            Column(Modifier.weight(1f)) {
                                                Text(command.label, color = Ice, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Text(command.description, color = Mist, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Surface(
                            color = Surface.copy(alpha = .96f),
                            shape = RoundedCornerShape(28.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .55f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(Modifier.padding(horizontal = 7.dp, vertical = 7.dp), verticalAlignment = Alignment.Bottom) {
                                IconButton(
                                    onClick = { attachmentSheet = true },
                                    enabled = interactionAvailable,
                                    modifier = Modifier.size(42.dp)
                                ) { Icon(Icons.Rounded.Add, nexusCopy("Allega foto o documento", "Attach photo or document"), tint = Ice, modifier = Modifier.size(21.dp)) }
                                BasicTextField(
                                    value = state.draft,
                                    onValueChange = { dispatch("draft", it.take(12_000)) },
                                    enabled = true,
                                    modifier = Modifier.weight(1f).heightIn(min = 42.dp, max = 132.dp).focusRequester(focusRequester).padding(start = 8.dp, top = 10.dp, bottom = 10.dp),
                                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ice),
                                    cursorBrush = SolidColor(Cyan),
                                    decorationBox = { inner ->
                                        Box {
                                            if (state.draft.isBlank()) Text(nexusCopy("Scrivi a NexusNXS", "Write to NexusNXS"), color = Mist, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            inner()
                                        }
                                    }
                                )
                                FilledIconButton(
                                    onClick = {
                                        if (state.busy) dispatch("stop", "") else if (state.draft.isNotBlank()) {
                                            keyboard?.hide()
                                            textMode = false
                                            dispatch("send", "")
                                        }
                                    },
                                    enabled = state.busy || (interactionAvailable && state.draft.isNotBlank()),
                                    modifier = Modifier.size(42.dp),
                                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Cyan, contentColor = Color(0xFF002223), disabledContainerColor = Surface2, disabledContentColor = Mist)
                                ) { Icon(if (state.busy) Icons.Rounded.Stop else Icons.Rounded.ArrowUpward, if (state.busy) nexusCopy("Interrompi", "Stop") else nexusCopy("Invia", "Send"), Modifier.size(20.dp)) }
                            }
                        }
                            } else Box(Modifier.fillMaxWidth().height(54.dp)) {
                                IconButton(
                                    onClick = { textMode = true },
                                    enabled = true,
                                    modifier = Modifier.align(Alignment.CenterStart).size(50.dp).clip(CircleShape).background(Surface.copy(alpha = .9f))
                                ) { Icon(Icons.Rounded.Keyboard, nexusCopy("Scrivi", "Type"), tint = Ice, modifier = Modifier.size(22.dp)) }
                            }
                        }
                    } else Box(Modifier.fillMaxSize()) {
                        BoxWithConstraints(Modifier.fillMaxSize().padding(bottom = 62.dp)) {
                            val wideCoreLayout = maxWidth > maxHeight * 1.5f
                            val renderCore: @Composable (Dp) -> Unit = { availableDiameter ->
                            NexusInstantCore(
                                fullScene = true,
                                active = voiceMode || state.busy,
                                offline = state.connection == NexusConnection.OFFLINE,
                                reduceMotion = reduceMotion,
                                energy = if (voiceMode) inlineVoiceEnergy else 0f,
                                diameter = minOf(homeCoreDiameter, availableDiameter),
                                phaseState = when { !interactionAvailable -> "offline"; voiceMode && inlineVoiceListening -> "listening"; voiceMode -> "transcribing"; state.speechPlayback == "speaking" -> "speaking"; state.busy || state.speechPlayback == "preparing" -> "thinking"; else -> "idle" },
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    if (!interactionAvailable) {
                                        dispatch("probe", "")
                                        return@NexusInstantCore
                                    }
                                    keyboard?.hide()
                                    textMode = false
                                    if (state.busy) dispatch("stop", "")
                                    dispatch("stopSpeech", "")
                                    voiceMode = !voiceMode
                                }
                            )
                            }
                            val renderLabels: @Composable () -> Unit = {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            AnimatedContent(
                                targetState = when {
                                    state.connection == NexusConnection.OFFLINE -> nexusCopy("Server offline · tocca per riprovare", "Server offline · tap to retry")
                                    state.connection == NexusConnection.CHECKING -> nexusCopy("Connessione ai server…", "Connecting to servers…")
                                    voiceMode -> inlineVoiceStatus.ifBlank { nexusCopy("Ti ascolto", "I'm listening") }
                                    state.busy -> state.activity.ifBlank { nexusCopy("Sto pensando…", "Thinking…") }
                                    else -> nexusCopy("Tocca il Core e parla", "Tap the Core and speak")
                                },
                                transitionSpec = { nexusTransform(reduceMotion) },
                                label = "instantStatus"
                            ) { label -> Text(label, color = if (state.connection == NexusConnection.OFFLINE) Color(0xFFFF9A91) else Mist, fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                            if (state.connection != NexusConnection.OFFLINE) Text(
                                if (voiceMode) inlineVoiceDetail else if (state.turns.isNotEmpty()) nexusCopy("Apri la tastiera per leggere la conversazione", "Open the keyboard to read the conversation") else nexusCopy("Voce privata · rispondo quando hai concluso", "Private voice · I respond when you finish"),
                                color = Mist, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                modifier = Modifier.padding(top = 8.dp).fillMaxWidth(.82f)
                            )
                            state.error?.let { error -> Text(error, color = Color(0xFFFF9A91), style = MaterialTheme.typography.bodySmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 14.dp)) }
                            }
                            }
                            if (wideCoreLayout) Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                                BoxWithConstraints(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
                                    renderCore(minOf(maxWidth, maxHeight))
                                }
                                Box(Modifier.weight(1f).verticalScroll(rememberScrollState()), contentAlignment = Alignment.Center) { renderLabels() }
                            } else Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                                BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    renderCore(minOf(maxWidth, maxHeight))
                                }
                                renderLabels()
                            }
                        }
                        IconButton(
                            onClick = { typedSession = true; textMode = true },
                            enabled = true,
                            modifier = Modifier.align(Alignment.BottomStart).size(52.dp).clip(CircleShape).background(Surface.copy(alpha = .9f))
                        ) { Icon(Icons.Rounded.Keyboard, nexusCopy("Scrivi", "Type"), tint = Ice, modifier = Modifier.size(23.dp)) }
                    }
                }
            }
        }
    }
        }
        BackHandler(enabled = settingsOpen) { settingsOpen = false }
        AnimatedVisibility(settingsOpen, enter = fadeIn(tween(if (reduceMotion) 0 else 180)), exit = fadeOut(tween(if (reduceMotion) 0 else 140))) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .38f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { settingsOpen = false })
        }
        AnimatedVisibility(settingsOpen, enter = slideInHorizontally(tween(if (reduceMotion) 0 else 260, easing = NexusFlow.standard)) { -it }, exit = slideOutHorizontally(tween(if (reduceMotion) 0 else 220, easing = NexusFlow.standard)) { -it }) {
            Surface(color = Surface, shape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp), modifier = Modifier.fillMaxHeight().width(minOf(coreConfiguration.screenWidthDp * .84f, 380f).dp)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .pointerInput(Unit) {
                    var travel = 0f
                    detectHorizontalDragGestures(onDragStart = { travel = 0f }, onHorizontalDrag = { change, delta ->
                        travel += delta
                        if (travel < -60.dp.toPx()) { change.consume(); settingsOpen = false }
                    })
                }) {
                Column(Modifier.statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("NexusNXS", style = MaterialTheme.typography.titleLarge, color = Ice, modifier = Modifier.weight(1f))
                        IconButton({ settingsOpen = false }) { Icon(Icons.Rounded.Close, nexusCopy("Chiudi menu", "Close menu"), tint = Mist) }
                    }
                    TextButton(onClick = { voiceMode = false; dispatch("stopSpeech", ""); dispatch("new", ""); settingsOpen = false; typedSession = true; textMode = true }, enabled = !state.busy) {
                        Icon(Icons.Rounded.Add, null); Spacer(Modifier.width(8.dp)); Text(nexusCopy("Nuova conversazione", "New conversation"))
                    }
                    Text(nexusCopy("Conversazioni recenti", "Recent conversations"), color = Mist, style = MaterialTheme.typography.labelLarge)
                    if (state.chats.isEmpty()) Text(nexusCopy("Le tue conversazioni appariranno qui", "Your conversations will appear here"), color = Mist, style = MaterialTheme.typography.bodySmall)
                    state.chats.take(12).forEach { chat ->
                        TextButton(onClick = { voiceMode = false; dispatch("stopSpeech", ""); dispatch("open", chat.id); settingsOpen = false; typedSession = true; textMode = false }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                            Text(chat.title, maxLines = 2, overflow = TextOverflow.Ellipsis, color = if (chat.id == state.conversationId) Cyan else Ice, modifier = Modifier.fillMaxWidth())
                        }
                    }
                    HorizontalDivider(color = Hairline)
                    Text(nexusCopy("Aspetto e interazione", "Appearance and interaction"), color = Mist, style = MaterialTheme.typography.labelLarge)
            CompactSetting(Icons.Rounded.Animation, nexusCopy("Riduci movimento", "Reduce motion"), nexusCopy("Segue anche le preferenze del dispositivo", "Also respects device preferences"), { Switch(state.reduceMotion, { dispatch("reduceMotion", "") }) }) { dispatch("reduceMotion", "") }
            CompactSetting(Icons.Rounded.Vibration, nexusCopy("Feedback aptico", "Haptic feedback"), "", { Switch(state.hapticsEnabled, { dispatch("haptics", "") }) }) { dispatch("haptics", "") }
            CompactSetting(
                Icons.Outlined.Computer,
                nexusCopy("Controllo remoto", "Remote control"),
                when {
                    state.remoteWorkAvailable -> nexusCopy("Workstation associata", "Workstation paired")
                    state.pairingAvailable -> nexusCopy("Associa e autorizza azioni sul PC", "Pair and authorize actions on your PC")
                    else -> nexusCopy("Non disponibile su questo server", "Unavailable on this server")
                },
                { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }
            ) { settingsOpen = false; remoteSettingsOpen = true }
            TextButton(onClick = {
                val role = if (android.os.Build.VERSION.SDK_INT >= 29) context.getSystemService(android.app.role.RoleManager::class.java) else null
                val request = if (Build.VERSION.SDK_INT >= 29 && role?.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT) == true && !role.isRoleHeld(android.app.role.RoleManager.ROLE_ASSISTANT)) role.createRequestRoleIntent(android.app.role.RoleManager.ROLE_ASSISTANT) else Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS)
                runCatching { context.startActivity(request) }.onFailure { runCatching { context.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)) } }
            }) { Text(nexusCopy("Usa Nexus come assistente", "Use Nexus as assistant")) }
            Text(nexusCopy("Il richiamo con il tasto laterale dipende dalle impostazioni del telefono. Il microfono resta sotto il tuo controllo.", "Side-button activation depends on your phone settings. The microphone remains under your control."), style = MaterialTheme.typography.bodySmall, color = Mist)

                    HorizontalDivider(color = Hairline)
                    CompactSetting(Icons.Rounded.Lock, nexusCopy("Schermata privata", "Private screen"), nexusCopy("Protegge le anteprime e le catture", "Protects previews and screenshots"), { Switch(state.privacyMode, { dispatch("privacyMode", "") }) }) { dispatch("privacyMode", "") }
                    TextButton({ dispatch("exportBackup", "") }) { Text(nexusCopy("Esporta backup cifrato", "Export encrypted backup")) }
                    TextButton({ dispatch("importBackup", "") }) { Text(nexusCopy("Importa backup", "Import backup")) }
                }
            }
        }
    }
    if (remoteSettingsOpen) AlertDialog(
        onDismissRequest = { remoteSettingsOpen = false },
        icon = { Icon(Icons.Outlined.Computer, null, tint = Cyan) },
        title = { Text(nexusCopy("Controllo remoto", "Remote control")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    if (state.remoteWorkAvailable) nexusCopy("NexusNXS può preparare azioni sul computer associato. Ogni operazione sensibile richiede conferma.", "NexusNXS can prepare actions on the paired computer. Every sensitive action requires confirmation.")
                    else nexusCopy("Inserisci il codice mostrato dall’app desktop per associare questa sessione.", "Enter the code shown by the desktop app to pair this session."),
                    color = Mist,
                    style = MaterialTheme.typography.bodyMedium
                )
                if (!state.remoteWorkAvailable && state.pairingAvailable) {
                    OutlinedTextField(
                        value = remotePairCode,
                        onValueChange = { remotePairCode = it.filter(Char::isDigit).take(6) },
                        label = { Text(nexusCopy("Codice a 6 cifre", "6-digit code")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { dispatch("pair", remotePairCode); remotePairCode = "" },
                        enabled = remotePairCode.length == 6,
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) { Text(nexusCopy("Associa workstation", "Pair workstation")) }
                }
                if (state.remoteWorkAvailable) {
                    OutlinedButton(
                        onClick = { dispatch(if (state.work) "chat" else "work", "") },
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) { Text(if (state.work) nexusCopy("Torna alla chat", "Return to chat") else nexusCopy("Apri modalità operativa", "Open work mode")) }
                    if (state.pairingAvailable && state.turns.isNotEmpty()) TextButton(
                        onClick = { dispatch("continueOnPc", "") },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(nexusCopy("Continua questa conversazione sul PC", "Continue this conversation on PC")) }
                }
            }
        },
        confirmButton = { TextButton({ remoteSettingsOpen = false }) { Text(nexusCopy("Fatto", "Done")) } },
        containerColor = Surface,
        shape = RoundedCornerShape(26.dp)
    )
    if (voiceMode && interactionAvailable) ContinuousVoicePanel(
        reduceMotion = reduceMotion,
        connection = state.connection,
        currentDraft = "",
        bargeIn = { dispatch("stopSpeech", "") },
        close = { voiceMode = false },
        transcript = {},
        instantSubmit = { phrase ->
            voiceMode = false
            typedSession = false
            dispatch("voiceSend", phrase)
        },
        inlineState = { listening, energy, status, detail -> inlineVoiceListening = listening; inlineVoiceEnergy = energy; inlineVoiceStatus = status; inlineVoiceDetail = detail }
    )
    NexusAttachmentFlow(
        visible = attachmentSheet && interactionAvailable,
        close = { attachmentSheet = false },
        dispatch = dispatch,
        remoteWorkAvailable = false,
        planMode = {}
    )
    if (state.remoteWorkAvailable && state.workTicketId.isNotBlank()) AlertDialog(
        onDismissRequest = { dispatch("cancelWork", "") },
        icon = { Icon(Icons.Outlined.VerifiedUser, null, tint = Cyan) },
        title = { Text(nexusCopy("Autorizza il Core", "Authorize Core")) },
        text = {
            Column {
                Text(state.workPreview.ifBlank { nexusCopy("NexusNXS ha preparato un’azione verificabile sul computer associato.", "NexusNXS prepared a verifiable action on your paired computer.") })
                if (state.workRisk.isNotBlank()) Text(
                    nexusCopy("Rischio: ${state.workRisk}", "Risk: ${state.workRisk}"),
                    color = Mist, style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 10.dp)
                )
            }
        },
        confirmButton = { Button({ dispatch("approveWork", "") }) { Text(nexusCopy("Autorizza", "Authorize")) } },
        dismissButton = { TextButton({ dispatch("cancelWork", "") }) { Text(nexusCopy("Annulla", "Cancel")) } },
        containerColor = Surface,
        shape = RoundedCornerShape(26.dp)
    )
}

/** Superficie traslucida invocata dal tasto laterale: nessuna apertura della UI completa. */
@Composable private fun NexusAssistantOverlay(state: NexusUiState, dispatch: (String, String) -> Unit) {
    var voiceMode by remember { mutableStateOf(true) }
    var inlineVoiceListening by remember { mutableStateOf(false) }
    var inlineVoiceEnergy by remember { mutableFloatStateOf(0f) }
    var inlineVoiceStatus by remember { mutableStateOf("") }
    var inlineVoiceDetail by remember { mutableStateOf("") }
    val online = state.connection == NexusConnection.ONLINE
    val metrics = LocalNexusMetrics.current
    val reduceMotion = state.reduceMotion || metrics.adaptiveReducedMotion || !ValueAnimator.areAnimatorsEnabled()
    val openApp: (String) -> Unit = { entry -> voiceMode = false; dispatch("assistantExpand", entry) }
    BackHandler { dispatch("assistantClose", "") }
    LaunchedEffect(state.connection) {
        while (!online) {
            dispatch("probe", "")
            kotlinx.coroutines.delay(4_000)
        }
    }
    Box(
        Modifier.fillMaxSize()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { dispatch("assistantClose", "") }
    ) {
        CosmicScene(Modifier.fillMaxSize())
        Column(
            modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 6.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                NexusInstantCore(
                    active = voiceMode || state.busy, offline = !online, reduceMotion = reduceMotion,
                    energy = if (voiceMode) inlineVoiceEnergy else 0f,
                    diameter = minOf(maxWidth, maxHeight, 1200.dp), fullScene = true,
                    phaseState = when { !online -> "offline"; voiceMode && inlineVoiceListening -> "listening"; voiceMode -> "transcribing"; state.speechPlayback == "speaking" -> "speaking"; state.busy || state.speechPlayback == "preparing" -> "thinking"; else -> "idle" }
                ) {
                    if (online) {
                        if (state.busy) dispatch("stop", "")
                        dispatch("stopSpeech", "")
                        voiceMode = !voiceMode
                    } else dispatch("probe", "")
                }
            }
            Text(
                when { !online -> nexusCopy("Riconnessione automatica", "Reconnecting automatically"); voiceMode -> inlineVoiceDetail.ifBlank { inlineVoiceStatus }; state.busy -> state.activity.ifBlank { nexusCopy("NexusNXS sta lavorando", "NexusNXS is working") }; else -> nexusCopy("Apri la tastiera per leggere i dettagli", "Open the keyboard to read the details") },
                color = Ice, style = MaterialTheme.typography.bodySmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 3, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp)
            )
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterHorizontally)) {
                IconButton({ openApp("attachment") }, modifier = Modifier.size(52.dp).clip(CircleShape).background(Surface2.copy(alpha = .9f))) {
                    Icon(Icons.Rounded.AttachFile, nexusCopy("Allega foto o documento", "Attach photo or document"), tint = Ice)
                }
                IconButton({ openApp("text") }, modifier = Modifier.size(52.dp).clip(CircleShape).background(Surface2.copy(alpha = .9f))) {
                    Icon(Icons.Rounded.Keyboard, nexusCopy("Scrivi", "Type"), tint = Ice)
                }
            }
        }
    }
    if (voiceMode && online) ContinuousVoicePanel(
        reduceMotion = reduceMotion,
        connection = state.connection,
        currentDraft = state.draft,
        bargeIn = { dispatch("stopSpeech", "") },
        close = { voiceMode = false },
        transcript = { dispatch("draft", it) },
        instantSubmit = { phrase -> voiceMode = false; dispatch("voiceSend", phrase) },
        compactOverlay = true,
        openKeyboard = { openApp("text") },
        openAttachment = { openApp("attachment") },
        inlineState = { listening, energy, status, detail -> inlineVoiceListening = listening; inlineVoiceEnergy = energy; inlineVoiceStatus = status; inlineVoiceDetail = detail }
    )
}

@Composable private fun InstantWrittenExchange(
    latestPrompt: String,
    latestAnswer: String,
    error: String?,
    centered: Boolean,
    busy: Boolean,
    activity: String,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        if (latestPrompt.isNotBlank()) Surface(
            color = Surface.copy(alpha = .72f),
            shape = RoundedCornerShape(18.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .36f))
        ) {
            Text(
                latestPrompt,
                color = Mist,
                style = MaterialTheme.typography.bodySmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.Start,
                modifier = Modifier.widthIn(max = 520.dp).padding(horizontal = 14.dp, vertical = 8.dp)
            )
        }
        AnimatedVisibility(
            visible = busy,
            enter = nexusEnter(reduceMotion),
            exit = nexusExit(reduceMotion)
        ) {
            InstantReasoningPhase(
                label = activity.ifBlank { nexusCopy("Comprendo la richiesta…", "Understanding your request…") },
                reduceMotion = reduceMotion,
                modifier = Modifier.fillMaxWidth(.92f).padding(top = 18.dp)
            )
        }
        if (latestAnswer.isNotBlank()) Box(Modifier.fillMaxWidth(.92f).widthIn(max = 680.dp).padding(top = if (latestPrompt.isBlank()) 0.dp else 18.dp)) {
            MarkdownMessage(streamSafeMarkdown(latestAnswer), streamingTailChars = if (busy) 48 else 0, streamingAccent = if (busy) .65f else 0f)
        }
        if (latestPrompt.isBlank() && latestAnswer.isBlank()) Text(
            nexusCopy("Scrivi. Il Core seguirà la conversazione.", "Type. The Core will follow the conversation."),
            color = Mist,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.widthIn(max = 420.dp).padding(horizontal = 18.dp)
        )
        error?.let { message -> Text(
            message,
            color = Color(0xFFFF9A91),
            style = MaterialTheme.typography.bodySmall,
            textAlign = if (centered) androidx.compose.ui.text.style.TextAlign.Center else androidx.compose.ui.text.style.TextAlign.Start,
            modifier = Modifier.fillMaxWidth(.92f).padding(top = 14.dp)
        ) }
    }
}

/** Rappresenta soltanto le fasi reali ricevute dal backend. */
@Composable private fun InstantReasoningPhase(label: String, reduceMotion: Boolean, modifier: Modifier = Modifier) {
    val phase = nexusLoopFloat(!reduceMotion, 0f, 1f, 920, RepeatMode.Restart, "instantReasoningParticles", linear = true)
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(width = 34.dp, height = 16.dp)) {
            repeat(7) { index ->
                val progress = (phase + index / 7f) % 1f
                val wave = kotlin.math.sin((progress * Math.PI).toFloat()).coerceAtLeast(0f)
                drawCircle(
                    color = Cyan.copy(alpha = .18f + wave * .72f),
                    radius = (1.2f + wave * 1.35f).dp.toPx(),
                    center = androidx.compose.ui.geometry.Offset(
                        size.width * progress,
                        size.height * (.5f + kotlin.math.sin((progress * 8f + index) * .55f) * .18f)
                    )
                )
            }
        }
        Spacer(Modifier.width(9.dp))
        AnimatedContent(label, transitionSpec = { nexusTransform(reduceMotion) }, label = "instantReasoningLabel") { value ->
            Text(value, color = Cyan.copy(alpha = .78f), style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable private fun InstantConnectionMark(connection: NexusConnection, modifier: Modifier = Modifier) {
    val color = when (connection) { NexusConnection.ONLINE -> Color(0xFF64E5B3); NexusConnection.CHECKING -> Mist; NexusConnection.OFFLINE -> Color(0xFFFF8A80) }
    Surface(
        color = Surface.copy(alpha = .76f),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .42f)),
        modifier = modifier
    ) {
        Row(Modifier.padding(horizontal = 11.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).background(color, CircleShape))
            Spacer(Modifier.width(7.dp))
            Text(when (connection) { NexusConnection.ONLINE -> nexusCopy("Online", "Online"); NexusConnection.CHECKING -> nexusCopy("Connessione", "Connecting"); NexusConnection.OFFLINE -> nexusCopy("Offline", "Offline") }, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable private fun NexusInstantCore(active: Boolean, offline: Boolean, reduceMotion: Boolean, energy: Float = 0f, diameter: Dp = 214.dp, phaseState: String = if (offline) "offline" else if (active) "listening" else "idle", fullScene: Boolean = false, onClick: () -> Unit) {
    if (fullScene) CosmicCore(diameter = diameter, state = phaseState, energy = energy, reduceMotion = reduceMotion, onClick = onClick)
    else CosmicStandaloneCore(diameter = diameter, state = phaseState, energy = energy, reduceMotion = reduceMotion, onClick = onClick)
}

@Composable private fun PremiumMenuGlyph() {
    val accessibilityLabel = nexusCopy("Apri menu", "Open menu")
    Column(
        Modifier.size(25.dp).semantics { contentDescription = accessibilityLabel },
        verticalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.Start
    ) {
        Box(Modifier.width(23.dp).height(2.dp).clip(CircleShape).background(Ice))
        Box(Modifier.width(15.dp).height(2.dp).clip(CircleShape).background(Ice))
        Box(Modifier.width(19.dp).height(2.dp).clip(CircleShape).background(Ice))
    }
}

private fun Int?.orEmptyIndex() = this ?: -1

private enum class ResponsePresentationKind { ANSWER, PLAN, RESEARCH, CODE }

private fun responsePresentationKind(value: String): ResponsePresentationKind = when {
    value.contains("```") || Regex("\\b(?:function|class|const|SELECT|CREATE TABLE|def )\\b", RegexOption.IGNORE_CASE).containsMatchIn(value) -> ResponsePresentationKind.CODE
    Regex("\\[[^]]+]\\(https://|\\b(?:fonti|sources|ricerca web)\\b", RegexOption.IGNORE_CASE).containsMatchIn(value) -> ResponsePresentationKind.RESEARCH
    Regex("(?:^|\\n)\\s*(?:#{1,4}\\s|[-*]\\s|\\d+[.)]\\s)").containsMatchIn(value) -> ResponsePresentationKind.PLAN
    else -> ResponsePresentationKind.ANSWER
}

private fun streamSafeMarkdown(value: String): String {
    var safe = value
    listOf("**", "`").forEach { token ->
        if ((safe.split(token).size - 1) % 2 != 0) {
            val at = safe.lastIndexOf(token)
            if (at >= 0) safe = safe.removeRange(at, at + token.length)
        }
    }
    val stars = Regex("(?<!\\*)\\*(?!\\*)").findAll(safe).toList()
    if (stars.size % 2 != 0) safe = safe.removeRange(stars.last().range)
    return safe
}

private fun readableMathNotation(value: String): String {
    val symbols = mapOf(
        "\\times" to "×", "\\cdot" to "·", "\\div" to "÷", "\\pm" to "±", "\\mp" to "∓",
        "\\neq" to "≠", "\\leq" to "≤", "\\le" to "≤", "\\geq" to "≥", "\\ge" to "≥", "\\approx" to "≈",
        "\\infty" to "∞", "\\sum" to "∑", "\\prod" to "∏", "\\int" to "∫", "\\partial" to "∂", "\\nabla" to "∇",
        "\\alpha" to "α", "\\beta" to "β", "\\gamma" to "γ", "\\delta" to "δ", "\\theta" to "θ", "\\lambda" to "λ",
        "\\mu" to "μ", "\\pi" to "π", "\\rho" to "ρ", "\\sigma" to "σ", "\\phi" to "φ", "\\omega" to "ω",
        "\\Delta" to "Δ", "\\Omega" to "Ω", "\\rightarrow" to "→", "\\to" to "→", "\\leftarrow" to "←",
        "\\in" to "∈", "\\notin" to "∉", "\\subset" to "⊂", "\\subseteq" to "⊆", "\\forall" to "∀", "\\exists" to "∃",
        "\\quad" to " ", "\\," to " ", "\\;" to " "
    )
    val superscripts = mapOf('0' to '⁰', '1' to '¹', '2' to '²', '3' to '³', '4' to '⁴', '5' to '⁵', '6' to '⁶', '7' to '⁷', '8' to '⁸', '9' to '⁹', '+' to '⁺', '-' to '⁻')
    val subscripts = mapOf('0' to '₀', '1' to '₁', '2' to '₂', '3' to '₃', '4' to '₄', '5' to '₅', '6' to '₆', '7' to '₇', '8' to '₈', '9' to '₉', '+' to '₊', '-' to '₋')
    var result = value.trim()
    repeat(4) {
        result = Regex("\\\\frac\\s*\\{([^{}]+)}\\s*\\{([^{}]+)}").replace(result, "($1)/($2)")
        result = Regex("\\\\sqrt\\s*\\{([^{}]+)}").replace(result, "√($1)")
    }
    symbols.entries.sortedByDescending { it.key.length }.forEach { (source, symbol) -> result = result.replace(source, symbol) }
    return result
        .replace(Regex("\\^\\{?([0-9+-]+)}?")) { match -> match.groupValues[1].map { superscripts[it] ?: it }.joinToString("") }
        .replace(Regex("_\\{?([0-9+-]+)}?")) { match -> match.groupValues[1].map { subscripts[it] ?: it }.joinToString("") }
        .replace(Regex("\\\\(?:left|right|mathrm|text|operatorname)\\b"), "")
        .replace(Regex("[{}]"), "")
        .replace(Regex("\\s+"), " ")
        .trim()
}

private fun normalizeInlineMath(value: String): String = Regex("\\x24([^\\x24\\n]+)\\x24|\\\\\\(([^\\n]+?)\\\\\\)")
    .replace(value) { match -> readableMathNotation(match.groups[1]?.value ?: match.groups[2]?.value.orEmpty()) }

private fun normalizeMathBlocks(value: String): String = Regex("(?s)\\x24\\x24(.+?)\\x24\\x24|\\\\\\[(.+?)\\\\\\]")
    .replace(value) { match -> "\n§NEXUS_MATH§${readableMathNotation(match.groups[1]?.value ?: match.groups[2]?.value.orEmpty())}\n" }

/** Parser incrementale: i blocchi conclusi non vengono riletti a ogni token. */
private class StreamingMarkdownAccumulator {
    private var previous = ""
    private var lineStart = 0
    private var lastSafeBoundary = 0
    private var inFence = false

    fun update(value: String): Pair<String, String> {
        if (!isAppendOfPrevious(value)) reset()
        var newline = value.indexOf('\n', lineStart)
        while (newline >= 0) {
            val line = value.substring(lineStart, newline)
            if (line.trimStart().startsWith("```")) inFence = !inFence
            else if (!inFence && line.isBlank()) lastSafeBoundary = newline + 1
            lineStart = newline + 1
            newline = value.indexOf('\n', lineStart)
        }
        previous = value
        if (value.length < 240 || lastSafeBoundary <= 0 || lastSafeBoundary >= value.length) return "" to streamSafeMarkdown(value)
        return value.substring(0, lastSafeBoundary).trimEnd() to streamSafeMarkdown(value.substring(lastSafeBoundary).trimStart())
    }

    private fun reset() {
        previous = ""
        lineStart = 0
        lastSafeBoundary = 0
        inFence = false
    }

    private fun isAppendOfPrevious(value: String): Boolean {
        if (previous.isEmpty()) return true
        if (value.length < previous.length) return false
        val probe = minOf(32, previous.length)
        return value.regionMatches(0, previous, 0, probe) &&
            value.regionMatches(previous.length - probe, previous, previous.length - probe, probe)
    }
}

private data class MobileParticle(val x: Float, val y: Float, val depth: Float, val phase: Float, val size: Float)

/** Versione mobile del tessuto particellare desktop: identità, stato e profondità con un solo Canvas. */

@Composable private fun TransparencyLine(label: String, value: String) = Row(Modifier.fillMaxWidth()) { Text(label.uppercase(), color = Color(0xFF557879), fontSize = 9.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.width(84.dp)); Text(value, color = Color(0xFFB6C7C7), fontSize = 11.sp, modifier = Modifier.weight(1f)) }

@Composable private fun MarkdownMessage(value: String, streamingTailChars: Int = 0, streamingAccent: Float = 0f) {
    val context = LocalContext.current
    val sections = value.split("```")
    val lastContentLine = value.lineSequence().lastOrNull { it.isNotBlank() }
    val tailColor = androidx.compose.ui.graphics.lerp(Ice, Cyan, streamingAccent.coerceIn(0f, 1f) * .72f)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        sections.forEachIndexed { index, raw ->
            if (raw.isBlank()) return@forEachIndexed
            if (index % 2 == 1) {
                val code = raw.substringAfter('\n', raw).trimEnd()
                Surface(color = Color(0xFF0B1217), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF9CB5FF).copy(alpha = .14f)), modifier = Modifier.fillMaxWidth()) {
                    Column { Row(Modifier.fillMaxWidth().background(Color(0xFF141D25)).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) { Text(raw.lineSequence().firstOrNull()?.takeIf { !it.contains(' ') }.orEmpty().ifBlank { nexusCopy("codice", "code") }.uppercase(), color = Color(0xFF8298B2), fontSize = 9.sp, letterSpacing = 1.sp, modifier = Modifier.weight(1f)); IconButton({ context.copyToClipboard(code) }, Modifier.size(32.dp)) { Icon(Icons.Rounded.ContentCopy, nexusCopy("Copia codice", "Copy code"), tint = Color(0xFFA8B8C8), modifier = Modifier.size(15.dp)) } }; HighlightedCodeText(code, Modifier.padding(13.dp)) }
                }
            } else normalizeMathBlocks(raw).lines().forEach { line ->
                when {
                    line.startsWith("§NEXUS_MATH§") -> Surface(color = Color(0xFF071415), shape = RoundedCornerShape(15.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .14f)), modifier = Modifier.fillMaxWidth()) {
                        Text(line.removePrefix("§NEXUS_MATH§"), color = Color(0xFFE7FEFF), fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 27.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp))
                    }
                    line.startsWith("### ") -> InlineMarkdownText(line.removePrefix("### "), MaterialTheme.typography.titleMedium, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                    line.startsWith("## ") -> InlineMarkdownText(line.removePrefix("## "), MaterialTheme.typography.titleLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                    line.startsWith("# ") -> InlineMarkdownText(line.removePrefix("# "), MaterialTheme.typography.headlineMedium, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                    line.startsWith("- ") || line.startsWith("* ") -> Row(Modifier.fillMaxWidth()) { Text("•", color = Ice, style = MaterialTheme.typography.bodyLarge); Spacer(Modifier.width(10.dp)); Box(Modifier.weight(1f)) { InlineMarkdownText(line.drop(2), MaterialTheme.typography.bodyLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor) } }
                    Regex("^>\\s*\\[!(NOTE|TIP|WARNING|RESULT)]", RegexOption.IGNORE_CASE).containsMatchIn(line) -> {
                        val tone = Regex("^>\\s*\\[!(NOTE|TIP|WARNING|RESULT)]", RegexOption.IGNORE_CASE).find(line)?.groupValues?.get(1)?.uppercase().orEmpty()
                        val accent = when (tone) { "TIP" -> Color(0xFF67DCA9); "WARNING" -> Color(0xFFEBB066); "RESULT" -> Color(0xFF8CB2FA); else -> Cyan }
                        val fallback = when (tone) { "TIP" -> nexusCopy("Suggerimento", "Tip"); "WARNING" -> nexusCopy("Attenzione", "Warning"); "RESULT" -> nexusCopy("Risultato", "Result"); else -> nexusCopy("Nota", "Note") }
                        val title = line.substringAfter(']').trim().ifBlank { fallback }
                        Surface(color = accent.copy(alpha = .065f), shape = RoundedCornerShape(4.dp, 15.dp, 15.dp, 4.dp), border = androidx.compose.foundation.BorderStroke(1.dp, accent.copy(alpha = .16f)), modifier = Modifier.fillMaxWidth()) { Text(title, color = accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp)) }
                    }
                    line.startsWith("> ") -> Row(Modifier.fillMaxWidth()) { Box(Modifier.width(3.dp).heightIn(min = 24.dp).background(Cyan.copy(alpha = .58f), CircleShape)); Spacer(Modifier.width(12.dp)); Box(Modifier.weight(1f)) { InlineMarkdownText(line.drop(2), MaterialTheme.typography.bodyMedium, Color(0xFFD2DEDE)) } }
                    line.matches(Regex("^\\d+\\.\\s+.*")) -> Row(Modifier.fillMaxWidth()) { Text(line.substringBefore('.') + ".", color = Ice, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold)); Spacer(Modifier.width(10.dp)); Box(Modifier.weight(1f)) { InlineMarkdownText(line.substringAfter('.').trim(), MaterialTheme.typography.bodyLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor) } }
                    line.count { it == '|' } >= 2 && line.trim('|', ' ', ':', '-').isBlank() -> Unit
                    line.count { it == '|' } >= 2 -> Surface(color = Surface, shape = RoundedCornerShape(10.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline.copy(alpha = .55f)), modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 9.dp)) {
                            line.trim('|').split('|').forEach { cell ->
                                InlineMarkdownText(cell.trim(), MaterialTheme.typography.bodyMedium, Ice, modifier = Modifier.widthIn(min = 112.dp, max = 220.dp).padding(horizontal = 6.dp))
                            }
                        }
                    }
                    line.isNotBlank() -> InlineMarkdownText(line, MaterialTheme.typography.bodyLarge, Ice, if (line == lastContentLine) streamingTailChars else 0, tailColor)
                }
            }
        }
    }
}

@Composable private fun HighlightedCodeText(value: String, modifier: Modifier = Modifier) {
    val highlighted = remember(value) {
        buildAnnotatedString {
            val tokenPattern = Regex("(//.*$|#.*$|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|\\b(?:const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|async|await|try|catch|throw|new|true|false|null|undefined|def|self|elif|except|with|as|SELECT|FROM|WHERE|JOIN|CREATE|TABLE|INSERT|UPDATE|DELETE)\\b|\\b\\d+(?:\\.\\d+)?\\b)", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE))
            var cursor = 0
            tokenPattern.findAll(value).forEach { match ->
                append(value.substring(cursor, match.range.first))
                val token = match.value
                val tokenColor = when {
                    token.startsWith("//") || token.startsWith("#") -> Color(0xFF657C80)
                    token.startsWith('"') || token.startsWith('\'') -> Color(0xFF9AD8BD)
                    token.firstOrNull()?.isDigit() == true -> Color(0xFFDEB98A)
                    else -> Color(0xFFA7BAFF)
                }
                pushStyle(SpanStyle(color = tokenColor)); append(token); pop()
                cursor = match.range.last + 1
            }
            append(value.substring(cursor))
        }
    }
    Text(highlighted, color = Color(0xFFBEDCDB), fontFamily = FontFamily.Monospace, fontSize = 12.5.sp, lineHeight = 19.sp, modifier = modifier)
}

@Composable private fun InlineMarkdownText(value: String, style: TextStyle, color: Color, accentTailChars: Int = 0, accentColor: Color = color, modifier: Modifier = Modifier) {
    val displayValue = remember(value) { normalizeInlineMath(value) }
    val annotated = remember(displayValue, color, accentTailChars, accentColor) {
        buildAnnotatedString {
            var cursor = 0
            Regex("(\\*\\*[^*]+\\*\\*|`[^`]+`|\\*[^*\\n]+\\*|\\[[^]]+]\\(https://[^)\\s]+\\))").findAll(displayValue).forEach { match ->
                append(displayValue.substring(cursor, match.range.first))
                val raw = match.value
                if (raw.startsWith("**")) {
                    pushStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = color)); append(raw.removeSurrounding("**")); pop()
                } else if (raw.startsWith("`")) {
                    pushStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Surface2, color = Color(0xFFD9E8E8))); append(raw.removeSurrounding("`")); pop()
                } else if (raw.startsWith("[")) {
                    val label = raw.substringAfter('[').substringBefore("](")
                    val url = raw.substringAfter("](").removeSuffix(")")
                    withLink(LinkAnnotation.Url(url, TextLinkStyles(style = SpanStyle(color = Cyan, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline)))) { append(label) }
                } else {
                    pushStyle(SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, color = color.copy(alpha = .92f))); append(raw.removeSurrounding("*")); pop()
                }
                cursor = match.range.last + 1
            }
            append(displayValue.substring(cursor))
            if (accentTailChars > 0 && length > 0) addStyle(SpanStyle(color = accentColor), (length - accentTailChars).coerceAtLeast(0), length)
        }
    }
    Text(annotated, color = color, style = style, modifier = modifier)
}

/** Un solo flusso nativo per foto, fotocamera e documenti in ogni superficie Android. */
@Composable private fun NexusAttachmentFlow(
    visible: Boolean,
    close: () -> Unit,
    dispatch: (String, String) -> Unit,
    remoteWorkAvailable: Boolean,
    planMode: () -> Unit
) {
    val context = LocalContext.current
    fun selectUri(uri: Uri?) {
        uri?.takeIf { it.scheme.equals("content", ignoreCase = true) } ?: return
        val mime = context.contentResolver.getType(uri).orEmpty().lowercase(Locale.ROOT)
        val supported = mime.startsWith("text/") || mime in setOf("image/jpeg", "image/png", "image/webp", "application/pdf", "application/json", "application/xml")
        if (!supported) {
            android.widget.Toast.makeText(context, context.nexusCopy("Formato non supportato.", "Unsupported format."), android.widget.Toast.LENGTH_SHORT).show()
            close()
            return
        }
        dispatch("attach", JSONObject()
            .put("name", uri.lastPathSegment?.substringAfterLast('/')?.replace(Regex("[\\p{Cntrl}]"), "")?.take(120) ?: "Allegato")
            .put("uri", uri.toString())
            .put("mime", mime.take(80))
            .toString())
        close()
    }
    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument(), ::selectUri)
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent(), ::selectUri)
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val uri = pendingCameraUri
        if (captured && uri != null) selectUri(uri)
        else uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
        pendingCameraUri = null
    }
    fun launchCamera() {
        val directory = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(directory, "Foto-${System.currentTimeMillis()}.jpg")
        val captureUri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        pendingCameraUri = captureUri
        camera.launch(captureUri)
    }
    if (visible) AttachmentPicker(
        close = close,
        gallery = { photoPicker.launch("image/*") },
        camera = ::launchCamera,
        document = { documentPicker.launch(arrayOf("application/pdf", "text/*", "application/json", "application/xml")) },
        remoteWorkAvailable = remoteWorkAvailable,
        planMode = planMode
    )
}

@Composable private fun AttachmentPreview(state: NexusComposerState, remove: () -> Unit) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val bitmap = remember(state.attachmentUri, state.attachmentData, state.attachmentMime) {
        if (!state.attachmentMime.startsWith("image/")) null else runCatching {
            when {
                state.attachmentData.isNotBlank() -> BitmapFactory.decodeByteArray(Base64.decode(state.attachmentData, Base64.DEFAULT), 0, Base64.decode(state.attachmentData, Base64.DEFAULT).size)
                state.attachmentUri.isNotBlank() -> context.contentResolver.openInputStream(state.attachmentUri.toUri())?.use(BitmapFactory::decodeStream)
                else -> null
            }?.asImageBitmap()
        }.getOrNull()
    }
    Surface(color = Surface, shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Hairline), modifier = Modifier.padding(bottom = 8.dp).widthIn(max = 260.dp).then(if (bitmap != null) Modifier.clickable { expanded = true } else Modifier)) {
        Row(Modifier.padding(7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(54.dp).clip(RoundedCornerShape(13.dp)).background(Surface2), contentAlignment = Alignment.Center) { if (bitmap != null) Image(bitmap, state.attachment.orEmpty(), Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Icon(Icons.Outlined.Description, null, tint = Cyan, modifier = Modifier.size(25.dp)) }
            Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(state.attachment.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(if (bitmap != null) nexusCopy("Immagine pronta", "Image ready") else nexusCopy("Documento pronto", "Document ready"), color = Mist, fontSize = 12.sp) }
            IconButton(remove, Modifier.size(48.dp)) { Icon(Icons.Rounded.Close, nexusCopy("Rimuovi allegato", "Remove attachment"), modifier = Modifier.size(19.dp)) }
        }
    }
    if (expanded && bitmap != null) Dialog(onDismissRequest = { expanded = false }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) { Box(Modifier.fillMaxSize().background(Ink).statusBarsPadding().navigationBarsPadding()) { Image(bitmap, state.attachment.orEmpty(), Modifier.fillMaxSize().padding(18.dp), contentScale = ContentScale.Fit); IconButton({ expanded = false }, Modifier.align(Alignment.TopEnd).padding(16.dp).size(50.dp).background(Surface.copy(alpha = .92f), CircleShape)) { Icon(Icons.Rounded.Close, "Chiudi anteprima", modifier = Modifier.size(26.dp)) } } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun AttachmentPicker(close: () -> Unit, gallery: () -> Unit, camera: () -> Unit, document: () -> Unit, remoteWorkAvailable: Boolean, planMode: () -> Unit) = ModalBottomSheet(onDismissRequest = close, containerColor = Surface, shape = NexusSheetShape, dragHandle = { BottomSheetDefaults.DragHandle(color = Mist) }) {
    Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 28.dp)) {
        Text(nexusCopy("Aggiungi alla conversazione", "Add to conversation"), fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 12.dp))
        SheetAction(Icons.Rounded.PhotoLibrary, nexusCopy("Carica foto", "Upload photo"), nexusCopy("Scegli un’immagine dalla galleria", "Choose an image from your gallery"), gallery)
        SheetAction(Icons.Rounded.PhotoCamera, nexusCopy("Fotocamera", "Camera"), nexusCopy("Scatta una foto adesso", "Take a photo now"), camera)
        if (remoteWorkAvailable) SheetAction(Icons.Outlined.Checklist, nexusCopy("Modalità Cuore", "Core mode"), nexusCopy("Pianifica, verifica e autorizza ogni azione", "Plan, review, and authorize every action"), planMode)
        HorizontalDivider(Modifier.padding(vertical = 8.dp), color = Hairline.copy(alpha = .55f))
        Text(nexusCopy("File", "Files"), color = Mist, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
        SheetAction(Icons.Rounded.Description, nexusCopy("Documento", "Document"), nexusCopy("PDF o file di testo", "PDF or text file"), document)
    }
}

@Composable private fun SheetAction(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = click).padding(horizontal = 10.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Color(0xFFD7E0E0), modifier = Modifier.size(21.dp)) }; Spacer(Modifier.width(11.dp)); Column { Text(title, style = MaterialTheme.typography.labelLarge); Text(detail, color = Mist, style = MaterialTheme.typography.bodySmall) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ContinuousVoicePanel(
    reduceMotion: Boolean,
    connection: NexusConnection,
    currentDraft: String,
    bargeIn: () -> Unit,
    close: () -> Unit,
    transcript: (String) -> Unit,
    instantSubmit: ((String) -> Unit)? = null,
    compactOverlay: Boolean = false,
    openKeyboard: (() -> Unit)? = null,
    openAttachment: (() -> Unit)? = null,
    inlineState: ((Boolean, Float, String, String) -> Unit)? = null
) {
    val context = LocalContext.current
    val activity = context as? ComponentActivity
    val configuration = LocalConfiguration.current
    val haptic = LocalHapticFeedback.current
    var listening by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf(NexusVoiceMode.IDLE) }
    var pendingMode by remember { mutableStateOf(NexusVoiceMode.IDLE) }
    var partial by remember { mutableStateOf("") }
    var voiceMessage by remember { mutableStateOf("") }
    var restart by remember { mutableIntStateOf(0) }
    var sessionGeneration by remember { mutableIntStateOf(0) }
    var recognitionErrors by remember { mutableIntStateOf(0) }
    var lastCommittedPhrase by remember { mutableStateOf("") }
    var lastCommittedAt by remember { mutableLongStateOf(0L) }
    var voiceEnergy by remember { mutableFloatStateOf(0f) }
    val latestDraft by rememberUpdatedState(currentDraft)
    val handler = remember { Handler(Looper.getMainLooper()) }
    val recognizerAvailable = remember(context) { SpeechRecognizer.isRecognitionAvailable(context) }
    val onDeviceAvailable = remember(context) { Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context) }
    val recognizer = remember(context, recognizerAvailable, onDeviceAvailable) {
        if (!recognizerAvailable) null
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && onDeviceAvailable) SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        else SpeechRecognizer.createSpeechRecognizer(context)
    }
    val voiceLocale = remember(configuration) {
        configuration.locales[0].toLanguageTag().ifBlank { Locale.getDefault().toLanguageTag() }
    }
    val voiceLocaleObject = remember(voiceLocale) { runCatching { Locale.forLanguageTag(voiceLocale) }.getOrDefault(Locale.getDefault()) }
    val intent = remember(voiceLocale, onDeviceAvailable) {
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, voiceLocale)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, voiceLocale)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, onDeviceAvailable)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 250L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 520L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 760L)
    }
    val activateCapture: (NexusVoiceMode) -> Unit = { requestedMode ->
        if (recognizer == null) {
            pendingMode = NexusVoiceMode.IDLE
            mode = NexusVoiceMode.IDLE
            voiceMessage = context.nexusCopy("Il riconoscimento vocale non è disponibile su questo dispositivo.", "Voice recognition is not available on this device.")
        } else {
            bargeIn()
            handler.removeCallbacksAndMessages(null)
            sessionGeneration++
            recognitionErrors = 0
            voiceMessage = ""
            mode = requestedMode
            pendingMode = NexusVoiceMode.IDLE
            listening = true
            restart++
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val requestedMode = pendingMode
        pendingMode = NexusVoiceMode.IDLE
        if (granted && requestedMode != NexusVoiceMode.IDLE) activateCapture(requestedMode)
        else if (!granted) voiceMessage = context.nexusCopy("Consenti il microfono per usare la voce. Puoi continuare scrivendo.", "Allow microphone access to use voice. You can continue by typing.")
    }
    val beginCapture: (NexusVoiceMode) -> Unit = { requestedMode ->
        if (recognizer == null) {
            voiceMessage = context.nexusCopy("Il riconoscimento vocale non è disponibile su questo dispositivo.", "Voice recognition is not available on this device.")
        } else if (androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            activateCapture(requestedMode)
        } else {
            pendingMode = requestedMode
            permission.launch(android.Manifest.permission.RECORD_AUDIO)
        }
    }
    val haltCapture: (Boolean, Boolean) -> Unit = { commitPending, tactile ->
        if (tactile) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        sessionGeneration++
        pendingMode = NexusVoiceMode.IDLE
        mode = NexusVoiceMode.IDLE
        handler.removeCallbacksAndMessages(null)
        if (commitPending) runCatching { recognizer?.stopListening() } else runCatching { recognizer?.cancel() }
        listening = false
        voiceEnergy = 0f
        partial = ""
    }
    val scheduleHandsFreeRestart: (Long) -> Unit = { delayMs ->
        val expectedGeneration = sessionGeneration
        handler.postDelayed({
            if (mode == NexusVoiceMode.HANDS_FREE && sessionGeneration == expectedGeneration) restart++
        }, delayMs)
    }
    DisposableEffect(recognizer) {
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { listening = true; recognitionErrors = 0 }
            override fun onBeginningOfSpeech() { listening = true; recognitionErrors = 0; voiceMessage = "" }
            override fun onRmsChanged(rmsdB: Float) { voiceEnergy = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f) }
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() { listening = false }
            override fun onError(error: Int) {
                listening = false
                voiceEnergy = 0f
                if (mode == NexusVoiceMode.IDLE || error == SpeechRecognizer.ERROR_CLIENT) return
                val networkFailure = error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                val permissionFailure = error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                val languageFailure = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
                if (permissionFailure || languageFailure || (networkFailure && !onDeviceAvailable)) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                    handler.removeCallbacksAndMessages(null)
                    voiceMessage = when {
                        permissionFailure -> context.nexusCopy("Il permesso del microfono è stato revocato.", "Microphone permission was revoked.")
                        languageFailure -> context.nexusCopy("La lingua del dispositivo non è supportata dal riconoscimento installato.", "The device language is not supported by the installed recognizer.")
                        else -> context.nexusCopy("La dettatura richiede rete su questo dispositivo. Puoi continuare scrivendo.", "Dictation needs a network connection on this device. You can continue by typing.")
                    }
                    return
                }
                if (mode != NexusVoiceMode.HANDS_FREE) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                    voiceMessage = if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) context.nexusCopy("Non ho rilevato una frase. Tocca per riprovare.", "I didn't detect a phrase. Tap to try again.") else context.nexusCopy("La dettatura si è interrotta. Tocca per riprovare.", "Dictation stopped. Tap to try again.")
                    return
                }
                val quietInput = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                recognitionErrors = if (quietInput) 0 else (recognitionErrors + 1).coerceAtMost(4)
                if (!quietInput && recognitionErrors >= 4) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                    voiceMessage = context.nexusCopy("La modalità continua è in pausa. Tocca per riprendere.", "Hands-free mode is paused. Tap to resume.")
                    return
                }
                val delayMs = if (quietInput) 420L else (320L shl (recognitionErrors - 1)).coerceAtMost(2_400L)
                scheduleHandsFreeRestart(delayMs)
            }
            override fun onResults(results: Bundle?) {
                val value = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
                val normalized = value.lowercase(voiceLocaleObject).replace(Regex("[\\p{Punct}\\s]+"), " ").trim()
                val now = SystemClock.elapsedRealtime()
                val draftNormalized = latestDraft.trim().lowercase(voiceLocaleObject).replace(Regex("[\\p{Punct}\\s]+"), " ").trim()
                val recentlyCommitted = now - lastCommittedAt < 4_000L
                val duplicate = normalized.isNotBlank() && recentlyCommitted && (normalized == lastCommittedPhrase || draftNormalized.endsWith(normalized))
                if (normalized.isNotBlank() && !duplicate) {
                    if (instantSubmit != null) instantSubmit(value)
                    else transcript(listOf(latestDraft.trim(), value).filter(String::isNotBlank).joinToString(" "))
                    lastCommittedPhrase = normalized
                    lastCommittedAt = now
                }
                recognitionErrors = 0
                partial = ""
                listening = false
                if (instantSubmit != null && normalized.isNotBlank() && !duplicate) {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                } else if (mode == NexusVoiceMode.HANDS_FREE) scheduleHandsFreeRestart(280L)
                else {
                    sessionGeneration++
                    mode = NexusVoiceMode.IDLE
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                if (mode != NexusVoiceMode.IDLE) partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            }
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        onDispose {
            handler.removeCallbacksAndMessages(null)
            runCatching { recognizer?.cancel() }
            runCatching { recognizer?.destroy() }
        }
    }
    DisposableEffect(activity, recognizer) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) haltCapture(false, false)
        }
        activity?.lifecycle?.addObserver(observer)
        onDispose { activity?.lifecycle?.removeObserver(observer) }
    }
    LaunchedEffect(restart) {
        if (restart > 0 && mode != NexusVoiceMode.IDLE) {
            runCatching { recognizer?.startListening(intent) }.onFailure {
                listening = false
                mode = NexusVoiceMode.IDLE
                voiceMessage = context.nexusCopy("La dettatura non è disponibile. Puoi continuare scrivendo.", "Dictation is unavailable. You can continue by typing.")
            }
        }
    }
    LaunchedEffect(Unit) {
        if (instantSubmit != null) beginCapture(NexusVoiceMode.SINGLE_TURN)
    }
    val voiceStatus = when {
        connection == NexusConnection.OFFLINE -> nexusCopy("Server offline", "Server offline")
        listening -> nexusCopy("Ti ascolto", "I'm listening")
        mode != NexusVoiceMode.IDLE -> nexusCopy("Elaboro la voce", "Processing voice")
        else -> nexusCopy("Parla con NexusNXS", "Talk to NexusNXS")
    }
    val voiceDetail = when {
        partial.isNotBlank() -> partial
        voiceMessage.isNotBlank() -> voiceMessage
        connection == NexusConnection.OFFLINE -> nexusCopy("Riconnessione automatica", "Reconnecting automatically")
        listening -> nexusCopy("Parla naturalmente", "Speak naturally")
        else -> nexusCopy("Tocca il Core per riprovare", "Tap the Core to try again")
    }
    val latestInlineState by rememberUpdatedState(inlineState)
    LaunchedEffect(listening, voiceEnergy, voiceStatus, voiceDetail) {
        latestInlineState?.invoke(listening, voiceEnergy, voiceStatus, voiceDetail)
    }
    if (inlineState != null) return
    if (compactOverlay) {
        Box(Modifier.fillMaxSize().navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 10.dp)) {
            Surface(
                color = Color(0xF4030A0B),
                shape = RoundedCornerShape(32.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Cyan.copy(alpha = .22f)),
                shadowElevation = 18.dp,
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().widthIn(max = 680.dp)
            ) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    NexusInstantCore(active = listening, offline = connection == NexusConnection.OFFLINE, reduceMotion = reduceMotion, energy = voiceEnergy, diameter = minOf(244f, LocalConfiguration.current.screenWidthDp - 88f, LocalConfiguration.current.screenHeightDp * .32f).coerceAtLeast(112f).dp) {
                        if (mode != NexusVoiceMode.IDLE || listening) { haltCapture(false, true); close() } else beginCapture(NexusVoiceMode.SINGLE_TURN)
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterHorizontally)) {
                        IconButton({ openAttachment?.invoke() }, enabled = openAttachment != null && connection == NexusConnection.ONLINE, modifier = Modifier.size(52.dp).background(Surface2, CircleShape)) {
                            Icon(Icons.Rounded.Add, nexusCopy("Allega foto o documento", "Attach photo or document"), tint = Ice)
                        }
                        IconButton({ haltCapture(false, false); openKeyboard?.invoke() }, enabled = openKeyboard != null, modifier = Modifier.size(52.dp).background(Surface2, CircleShape)) {
                            Icon(Icons.Rounded.Keyboard, nexusCopy("Scrivi", "Type"), tint = Ice)
                        }
                    }
                }
                AnimatedContent(voiceStatus, transitionSpec = { nexusTransform(reduceMotion) }, label = "assistantVoiceStatus") { value ->
                    Text(value, color = Ice, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 7.dp))
                }
                Text(voiceDetail, color = if (partial.isNotBlank()) Ice else Mist, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
        }
    } else Dialog(onDismissRequest = { haltCapture(false, false); close() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(color = Color(0xFF030809), modifier = Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(20.dp)) {
                IconButton(
                    onClick = { haltCapture(false, false); close() },
                    modifier = Modifier.align(Alignment.TopEnd).size(48.dp).clip(CircleShape).background(Surface.copy(alpha = .72f))
                ) { Icon(Icons.Rounded.Close, nexusCopy("Chiudi", "Close"), modifier = Modifier.size(23.dp)) }
                Column(Modifier.align(Alignment.Center).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.fillMaxWidth().height(238.dp), contentAlignment = Alignment.Center) {

                        NexusInstantCore(
                            active = listening,
                            offline = connection == NexusConnection.OFFLINE,
                            reduceMotion = reduceMotion,
                            energy = voiceEnergy,
                            onClick = {
                                if (mode != NexusVoiceMode.IDLE || listening) {
                                    haltCapture(false, true)
                                    close()
                                } else beginCapture(NexusVoiceMode.SINGLE_TURN)
                            }
                        )
                    }
                    AnimatedContent(
                        targetState = voiceStatus,
                        transitionSpec = { nexusTransform(reduceMotion) }, label = "instantVoiceTitle"
                    ) { title ->
                        Text(title, color = Ice, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    Text(voiceDetail, color = if (partial.isNotBlank()) Ice else Mist, style = MaterialTheme.typography.bodyLarge, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp), maxLines = 4, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    when {
                        connection == NexusConnection.OFFLINE -> nexusCopy("Torna al Core e riprova la connessione", "Return to the Core and retry the connection")
                        recognizerAvailable -> nexusCopy("Tocca di nuovo il Core per tornare indietro", "Tap the Core again to go back")
                        else -> nexusCopy("Usa la tastiera per continuare", "Use the keyboard to continue")
                    },
                    color = Mist, fontSize = 12.sp,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp)
                )
            }
        }
    }
}

@Composable private fun DrawerItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).clickable(onClick = click).padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = Color(0xFFC4CECE), modifier = Modifier.size(20.dp)); Spacer(Modifier.width(12.dp)); Text(label, style = MaterialTheme.typography.bodyMedium) }

@Composable private fun RemoteDrawerItem(label: String, click: () -> Unit) = Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).clickable(onClick = click).padding(horizontal = 11.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) { RemoteGlyph(); Spacer(Modifier.width(13.dp)); Text(label, fontSize = 15.sp) }

@Composable private fun RemoteGlyph() = Canvas(Modifier.size(22.dp).semantics { contentDescription = "Remote" }) {
    val stroke = 1.8.dp.toPx()
    drawRoundRect(Mist, androidx.compose.ui.geometry.Offset(size.width * .14f, size.height * .08f), androidx.compose.ui.geometry.Size(size.width * .72f, size.height * .52f), androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()), style = androidx.compose.ui.graphics.drawscope.Stroke(stroke))
    drawLine(Mist, androidx.compose.ui.geometry.Offset(size.width * .05f, size.height * .70f), androidx.compose.ui.geometry.Offset(size.width * .95f, size.height * .70f), stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
    listOf(.18f, .39f, .61f, .82f).forEach { x -> drawCircle(Mist, radius = 1.1.dp.toPx(), center = androidx.compose.ui.geometry.Offset(size.width * x, size.height * .91f)) }
}

@Composable private fun Page(title: String, dispatch: (String, String) -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val metrics = LocalNexusMetrics.current
    val scrollState = rememberSaveable(title, saver = androidx.compose.foundation.ScrollState.Saver) { androidx.compose.foundation.ScrollState(0) }
    Column(Modifier.fillMaxHeight().fillMaxWidth().widthIn(max = metrics.contentMaxWidth).wrapContentWidth(Alignment.CenterHorizontally).statusBarsPadding().verticalScroll(scrollState).padding(horizontal = metrics.horizontalPadding, vertical = 8.dp)) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { IconButton({ dispatch("back", "") }, Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, nexusCopy("Torna alla chat", "Back to chat"), tint = Ice) }; Text(title, fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp)) }; Spacer(Modifier.height(18.dp)); content() }
}

private fun historyGroupLabel(updatedAt: Long, italian: Boolean = true): String {
    val age = (System.currentTimeMillis() - updatedAt).coerceAtLeast(0L)
    return when {
        age < 24 * 60 * 60 * 1000L -> if (italian) "Oggi" else "Today"
        age < 48 * 60 * 60 * 1000L -> if (italian) "Ieri" else "Yesterday"
        age < 7 * 24 * 60 * 60 * 1000L -> if (italian) "Ultimi 7 giorni" else "Last 7 days"
        else -> if (italian) "Precedenti" else "Earlier"
    }
}

@Composable private fun SimpleHub(title: String, detail: String, icon: androidx.compose.ui.graphics.vector.ImageVector, cardTitle: String, cardDetail: String, dispatch: (String, String) -> Unit) = Page(title, dispatch) { Text(detail, color = Mist); Spacer(Modifier.height(20.dp)); Surface(color = Surface, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().clickable { dispatch("work", "") }) { Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, null, tint = Cyan); Spacer(Modifier.width(16.dp)); Column { Text(cardTitle, fontWeight = FontWeight.Bold); Text(cardDetail, color = Mist, fontSize = 13.sp) } } } }

@Composable private fun AttentionActionCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    detail: String,
    tint: Color,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null
) = Surface(color = Surface, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
    Column(Modifier.padding(15.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(tint.copy(alpha = .13f), CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(21.dp)) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(detail, color = Mist, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp)) }
        }
        if (primary != null || secondary != null) Row(Modifier.fillMaxWidth().padding(top = 11.dp), horizontalArrangement = Arrangement.End) {
            secondary?.let { (label, action) -> TextButton(action) { Text(label) } }
            primary?.let { (label, action) -> TextButton(action) { Text(label, color = Cyan) } }
        }
    }
}

@Composable private fun SettingsNexusGroup(state: NexusUiState, dispatch: (String, String) -> Unit) { SectionLabel("NEXUSNXS"); SettingsGroup { CompactSetting(Icons.Rounded.Memory, nexusCopy("Modello predefinito", "Default model"), state.model, { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("modelSheet", "") }; CompactSetting(Icons.Rounded.Animation, nexusCopy("Riduci animazioni", "Reduce motion"), nexusCopy("Transizioni e pulsazioni più discrete", "Subtler transitions and pulses"), { Switch(state.reduceMotion, { dispatch("reduceMotion", "") }) }) { dispatch("reduceMotion", "") }; if (android.os.Build.VERSION.SDK_INT >= 31) CompactSetting(Icons.Rounded.Vibration, nexusCopy("Feedback aptico", "Haptic feedback"), nexusCopy("Conferme discrete per gesture e cambi modalità", "Subtle feedback for gestures and mode changes"), { Switch(state.hapticsEnabled, { dispatch("haptics", "") }) }) { dispatch("haptics", "") } } }

@Composable private fun SettingsPrivacyGroup(state: NexusUiState, dispatch: (String, String) -> Unit, clear: () -> Unit) { SectionLabel(nexusCopy("PRIVACY E DATI", "PRIVACY AND DATA")); SettingsGroup { CompactSetting(Icons.Rounded.VisibilityOff, nexusCopy("Modalità privacy", "Privacy mode"), nexusCopy("Nasconde anteprime, schermate recenti e notifiche sensibili", "Hides previews, recent screens, and sensitive notifications"), { Switch(state.privacyMode, { dispatch("privacyMode", "") }) }) { dispatch("privacyMode", "") }; CompactSetting(Icons.Outlined.HealthAndSafety, nexusCopy("Diagnostica NexusNXS", "NexusNXS diagnostics"), nexusCopy("Connessione, sessione, coda e protezioni locali", "Connection, session, queue, and local protections"), { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("diagnostics", "") }; CompactSetting(Icons.Rounded.Backup, nexusCopy("Esporta backup cifrato", "Export encrypted backup"), nexusCopy("Archivio leggibile soltanto su questo dispositivo", "Archive readable only on this device"), { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("exportBackup", "") }; CompactSetting(Icons.Rounded.Restore, nexusCopy("Ripristina backup", "Restore backup"), nexusCopy("Importa conversazioni senza sovrascrivere quelle presenti", "Import conversations without replacing existing ones"), { Icon(Icons.Rounded.ChevronRight, null, tint = Mist) }) { dispatch("importBackup", "") }; CompactSetting(Icons.Rounded.DeleteOutline, nexusCopy("Cancella chat locali", "Delete local chats"), nexusCopy("Rimuove la cronologia dal telefono", "Removes history from this phone"), {}, clear) } }

@Composable private fun DiagnosticLine(label: String, value: String, healthy: Boolean) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(9.dp).background(if (healthy) Color(0xFF69DCAE) else Color(0xFFF0C76A), CircleShape)); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(label, fontSize = 13.sp, fontWeight = FontWeight.Medium); Text(value, color = Mist, fontSize = 12.sp) } }

@Composable private fun SettingsGroup(content: @Composable ColumnScope.() -> Unit) = Surface(color = Surface, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) { Column(content = content) }

@Composable private fun CompactSetting(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String, trailing: @Composable () -> Unit, click: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val fontScale = LocalDensity.current.fontScale
    val background by animateColorAsState(if (pressed) Cyan.copy(alpha = .065f) else Color.Transparent, tween(NexusFlow.QUICK, easing = NexusFlow.standard), label = "settingPress")
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(background).clickable(interactionSource = interaction, indication = null, onClick = click).padding(horizontal = 15.dp, vertical = if (fontScale > 1.3f) 16.dp else 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (pressed) Cyan else Mist, modifier = Modifier.size(21.dp)); Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) { Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(detail, color = Mist, fontSize = 12.sp, maxLines = if (fontScale > 1.3f) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis) }
        Box(Modifier.widthIn(min = 48.dp), contentAlignment = Alignment.CenterEnd) { trailing() }
    }
}

@Composable private fun SectionLabel(value: String) { Text(value, color = Mist, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .8.sp, modifier = Modifier.padding(start = 4.dp, top = 20.dp, bottom = 7.dp)) }

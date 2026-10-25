/** @module android/ResponseArtifacts Bounded local results using the chat typography and platform document picker. */
package local.nexus.remote

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// #region Bounded data and previews
private fun imageBytes(artifact: WorkArtifact): ByteArray? {
    if (artifact.kind != "image" || artifact.url.length > 2 * 1024 * 1024 || !artifact.url.matches(Regex("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$"))) return null
    return runCatching { Base64.decode(artifact.url.substringAfter(','), Base64.NO_WRAP) }.getOrNull()
}
@Composable internal fun ResponseArtifacts(artifacts: List<WorkArtifact>, reduceMotion: Boolean) {
    var expandedIndex by remember(artifacts) { mutableIntStateOf(-1) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        artifacts.take(12).forEachIndexed { index, artifact -> key(index, artifact.kind) {
            ResponseArtifact(artifact, reduceMotion, expandedIndex == index) { expandedIndex = if (expandedIndex == index) -1 else index }
        } }
    }
}
// #endregion

// #region Native actions; opening the picker never grants arbitrary filesystem access
@Composable private fun ResponseArtifact(artifact: WorkArtifact, reduceMotion: Boolean, expanded: Boolean, toggle: () -> Unit) {
    val context = LocalContext.current
    val italian = LocalConfiguration.current.locales[0].language == "it"
    var pendingDownload by remember { mutableStateOf<ByteArray?>(null) }
    var preparingDownload by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val mime = if (artifact.url.startsWith("data:image/png")) "image/png" else if (artifact.url.startsWith("data:image/jpeg")) "image/jpeg" else if (artifact.url.startsWith("data:image/webp")) "image/webp" else "text/plain"
    val bitmap by produceState<ImageBitmap?>(null, artifact.kind, artifact.url, expanded) {
        value = if (!expanded) null else withContext(Dispatchers.Default) {
            imageBytes(artifact)?.let { bytes -> runCatching {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                val sample = BoundedContentReader.previewSampleSize(bounds.outWidth, bounds.outHeight)
                if (sample == 0) null else BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })?.asImageBitmap()
            }.getOrNull() }
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)) { uri ->
        val bytes = pendingDownload; pendingDownload = null
        if (uri != null && bytes != null) scope.launch {
            val saved = withContext(Dispatchers.IO) { runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("unavailable") }.isSuccess }
            Toast.makeText(context, if (saved) if (italian) "Salvato" else "Saved" else if (italian) "Salvataggio non riuscito" else "Could not save", Toast.LENGTH_SHORT).show()
        }
    }
    Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = .72f), shape = MaterialTheme.shapes.large) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(artifact.title.ifBlank { if (italian) "Risultato" else "Result" }, style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp).clickable(onClick = toggle).padding(vertical = 14.dp))
                IconButton(onClick = toggle) { Icon(NexusSymbols.ChevronRight, if (italian) if (expanded) "Chiudi risultato" else "Apri risultato" else if (expanded) "Close result" else "Open result", modifier = Modifier.rotate(if (expanded) 90f else 0f)) }
            }
            AnimatedVisibility(expanded, enter = fadeIn(tween(if (reduceMotion) 0 else 180)), exit = fadeOut(tween(if (reduceMotion) 0 else 140))) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (bitmap != null) Image(bitmap!!, artifact.title, Modifier.fillMaxWidth().heightIn(max = 360.dp), contentScale = ContentScale.Fit)
                    else if (artifact.content.isNotBlank()) MarkdownMessage(if (artifact.kind == "code") "```\n${artifact.content}\n```" else artifact.content)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        if (artifact.kind == "link") {
                            val target = runCatching { Uri.parse(artifact.url) }.getOrNull()
                            if (target?.scheme == "https" && !target.host.isNullOrBlank() && target.userInfo == null) IconButton(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, target)) } }) { Icon(NexusSymbols.Browser, if (italian) "Apri fonte" else "Open source") }
                        }
                        if (artifact.kind != "image") IconButton(onClick = {
                            (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(artifact.title, artifact.content))
                            Toast.makeText(context, if (italian) "Copiato" else "Copied", Toast.LENGTH_SHORT).show()
                        }) { Icon(NexusSymbols.ContentCopy, if (italian) "Copia risultato" else "Copy result") }
                        IconButton(enabled = !preparingDownload, onClick = {
                            preparingDownload = true
                            scope.launch {
                                try {
                                    pendingDownload = withContext(Dispatchers.Default) { if (artifact.kind == "image") imageBytes(artifact) else artifact.content.toByteArray(Charsets.UTF_8) }
                                    if (pendingDownload != null) picker.launch("NexusNXS." + if (mime == "image/png") "png" else if (mime == "image/jpeg") "jpg" else if (mime == "image/webp") "webp" else "txt")
                                    else Toast.makeText(context, if (italian) "Immagine non disponibile" else "Image unavailable", Toast.LENGTH_SHORT).show()
                                } finally { preparingDownload = false }
                            }
                        }) { Icon(NexusSymbols.Download, if (italian) "Scarica risultato" else "Download result") }
                    }
                }
            }
        }
    }
}
// #endregion

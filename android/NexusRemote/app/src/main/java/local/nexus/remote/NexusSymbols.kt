// Generated from config/android-symbols.json; Google Material Symbols, Apache-2.0.
package local.nexus.remote

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp
import local.nexus.motion.NexusSymbolPaths

internal object NexusSymbols {
    private val cache = java.util.concurrent.ConcurrentHashMap<String, ImageVector>()
    private fun vector(name: String): ImageVector = cache.getOrPut(name) {
        ImageVector.Builder(name = "Nexus" + name, defaultWidth = 24.dp, defaultHeight = 24.dp,
            viewportWidth = 960f, viewportHeight = 960f, autoMirror = name == "ArrowBack" || name == "ChevronRight").apply {
            addGroup(translationY = 960f)
            addPath(pathData = addPathNodes(NexusSymbolPaths.path(name)), fill = SolidColor(Color.Black))
            clearGroup()
        }.build()
    }
    val Add: ImageVector get() = vector("Add")
    val Animation: ImageVector get() = vector("Animation")
    val ArrowBack: ImageVector get() = vector("ArrowBack")
    val ArrowUpward: ImageVector get() = vector("ArrowUpward")
    val AttachFile: ImageVector get() = vector("AttachFile")
    val Backup: ImageVector get() = vector("Backup")
    val Checklist: ImageVector get() = vector("Checklist")
    val ChevronRight: ImageVector get() = vector("ChevronRight")
    val Close: ImageVector get() = vector("Close")
    val Computer: ImageVector get() = vector("Computer")
    val ContentCopy: ImageVector get() = vector("ContentCopy")
    val DeleteOutline: ImageVector get() = vector("DeleteOutline")
    val Description: ImageVector get() = vector("Description")
    val HealthAndSafety: ImageVector get() = vector("HealthAndSafety")
    val Keyboard: ImageVector get() = vector("Keyboard")
    val Lock: ImageVector get() = vector("Lock")
    val Memory: ImageVector get() = vector("Memory")
    val Mic: ImageVector get() = vector("Mic")
    val MoreVert: ImageVector get() = vector("MoreVert")
    val PhotoCamera: ImageVector get() = vector("PhotoCamera")
    val PhotoLibrary: ImageVector get() = vector("PhotoLibrary")
    val Restore: ImageVector get() = vector("Restore")
    val Search: ImageVector get() = vector("Search")
    val Settings: ImageVector get() = vector("Settings")
    val Stop: ImageVector get() = vector("Stop")
    val Tune: ImageVector get() = vector("Tune")
    val Vibration: ImageVector get() = vector("Vibration")
    val VisibilityOff: ImageVector get() = vector("VisibilityOff")
    val VerifiedUser: ImageVector get() = vector("VerifiedUser")
    val Folder: ImageVector get() = vector("Folder")
    val FolderOpen: ImageVector get() = vector("FolderOpen")
    val Game: ImageVector get() = vector("Game")
    val Chat: ImageVector get() = vector("Chat")
    val Browser: ImageVector get() = vector("Browser")
    val Terminal: ImageVector get() = vector("Terminal")
    val RemoteDesktop: ImageVector get() = vector("RemoteDesktop")
    val Restart: ImageVector get() = vector("Restart")
    val Power: ImageVector get() = vector("Power")
    val Pulse: ImageVector get() = vector("Pulse")
    val Dashboard: ImageVector get() = vector("Dashboard")
    val Apps: ImageVector get() = vector("Apps")
    val Services: ImageVector get() = vector("Services")
}

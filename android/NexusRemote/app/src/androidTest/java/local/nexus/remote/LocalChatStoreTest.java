package local.nexus.remote;

import android.content.Context;
import android.util.Base64;
import java.io.File;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import android.database.Cursor;
import android.database.CursorWindow;
import android.database.sqlite.SQLiteCursor;
import android.os.Build;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises real SQLite and Android Keystore in the separate QA sandbox. */
@RunWith(AndroidJUnit4.class)
public class LocalChatStoreTest {
    private Context context;
    private LocalChatStore store;

    @Before public void open() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Never run against personal data", context.getPackageName().endsWith(".qa"));
        context.deleteDatabase("nexusnxs-chats.db");
        store = new LocalChatStore(context);
    }

    @After public void close() {
        if (store != null) { store.clearAll(); store.close(); }
        if (context != null && context.getPackageName().endsWith(".qa")) context.deleteDatabase("nexusnxs-chats.db");
    }

    private JSONObject attachment(String text) throws Exception {
        return new JSONObject().put("name", "qa-document.txt").put("mime", "text/plain")
            .put("data", Base64.encodeToString(text.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
    }

    private int composerFileCount() {
        File[] files = new File(context.getNoBackupFilesDir(), "nexus-composer").listFiles();
        return files == null ? 0 : files.length;
    }

    @Test public void composerSurvivesReopenAndNeverLeaksIntoAnotherConversation() throws Exception {
        String first = store.createConversation(), second = store.createConversation();
        JSONObject selected = attachment("private composer content");
        store.saveDraft(first, "bozza non inviata");
        store.saveComposerAttachment(first, selected);
        assertEquals("", store.getDraft(second));
        assertNull(store.getComposerAttachment(second));
        store.close();
        store = new LocalChatStore(context);
        store.pruneComposerAttachments();
        assertEquals("bozza non inviata", store.getDraft(first));
        assertEquals(selected.toString(), store.getComposerAttachment(first).toString());
        try (Cursor row = store.getReadableDatabase().rawQuery("SELECT draft,attachment_file FROM conversation_composers WHERE conversation_id=?", new String[]{first})) {
            assertTrue(row.moveToFirst());
            assertNotEquals("bozza non inviata", row.getString(0));
            String raw = new String(java.nio.file.Files.readAllBytes(new File(context.getNoBackupFilesDir(), "nexus-composer/" + row.getString(1)).toPath()), StandardCharsets.UTF_8);
            assertTrue(raw.startsWith("nexus:v1:"));
            assertFalse(raw.contains("private composer content"));
            assertFalse(raw.contains(selected.optString("data")));
        }
    }

    @Test public void emptyConversationCleanupRetainsDraftOrAttachmentUntilCleared() throws Exception {
        String draft = store.createConversation(), file = store.createConversation(), empty = store.createConversation(), active = store.createConversation();
        store.saveDraft(draft, "conserva");
        store.saveComposerAttachment(file, attachment("conserva file"));
        store.deleteEmptyConversationsExcept(active);
        assertNotNull(store.get(draft)); assertNotNull(store.get(file)); assertNotNull(store.get(active)); assertNull(store.get(empty));
        store.clearComposer(draft); store.clearComposer(file);
        store.deleteEmptyConversationsExcept(active);
        assertNull(store.get(draft)); assertNull(store.get(file)); assertEquals(0, composerFileCount());
    }

    @Test public void removingReplacingAndDeletingAttachmentsRetainsOnlyReferencedFiles() throws Exception {
        String id = store.createConversation();
        store.saveDraft(id, "retain text");
        store.saveComposerAttachment(id, attachment("first"));
        store.saveComposerAttachment(id, attachment("second"));
        assertEquals(1, composerFileCount());
        store.saveComposerAttachment(id, null);
        assertEquals("retain text", store.getDraft(id)); assertNull(store.getComposerAttachment(id)); assertEquals(0, composerFileCount());
        store.saveComposerAttachment(id, attachment("third"));
        store.deleteConversation(id);
        assertEquals(0, composerFileCount());
        assertFalse(store.saveDraft(id, "late callback"));
        assertFalse(store.saveComposerAttachment(id, attachment("late callback")));
        assertNull(store.get(id));
    }

    @Test public void queuedAttachmentSurvivesComposerCleanupAfterSending() throws Exception {
        String id = store.createConversation();
        JSONObject selected = attachment("queued content");
        store.saveDraft(id, "question"); store.saveComposerAttachment(id, selected);
        store.addTurn(id, "user", "question");
        store.queueRequest(id, "question", "fast", store.getComposerAttachment(id).toString());
        store.clearComposer(id);
        assertEquals("", store.getDraft(id)); assertNull(store.getComposerAttachment(id)); assertEquals(0, composerFileCount());
        assertEquals(selected.toString(), store.nextPendingRequest().getString("attachment"));
    }

    @Test public void maximumAttachmentQueueSurvivesReopen() throws Exception {
        assertMaximumAttachmentQueue(null);
    }

    @Test public void maximumAttachmentQueueSurvivesTwoMiBWindow() throws Exception {
        if (Build.VERSION.SDK_INT < 28) {
            org.junit.Assume.assumeTrue("Custom CursorWindow sizing requires API28", false);
            return;
        }
        assertMaximumAttachmentQueue((db, driver, table, query) -> {
            SQLiteCursor cursor = new SQLiteCursor(driver, table, query);
            cursor.setWindow(new CursorWindow("nexus-qa-two-mib", 2L * 1024L * 1024L));
            return cursor;
        });
    }

    private void assertMaximumAttachmentQueue(SQLiteDatabase.CursorFactory factory) throws Exception {
        byte[] content = new byte[LocalChatStore.MAX_COMPOSER_ATTACHMENT_BYTES];
        for (int index = 0; index < content.length; index++) content[index] = (byte) (index % 251);
        JSONObject selected = new JSONObject().put("name", "maximum.bin").put("mime", "application/octet-stream")
            .put("data", Base64.encodeToString(content, Base64.NO_WRAP));
        String id = store.createConversation();
        String requestId = store.queueRequest(id, "inspect attachment", "fast", selected.toString());
        store.close(); store = new LocalChatStore(context, factory);
        JSONObject pending = store.nextPendingRequest();
        assertNotNull("The maximum accepted attachment must remain readable by the retry queue", pending);
        assertEquals(requestId, pending.getString("id"));
        assertArrayEquals(content, Base64.decode(new JSONObject(pending.getString("attachment")).getString("data"), Base64.DEFAULT));
    }

    @Test public void invalidOrOversizeAttachmentDoesNotReplaceTheExistingOne() throws Exception {
        String id = store.createConversation();
        JSONObject original = attachment("retained");
        store.saveComposerAttachment(id, original);
        for (JSONObject invalid : new JSONObject[]{attachment(""), new JSONObject().put("data", Base64.encodeToString(new byte[LocalChatStore.MAX_COMPOSER_ATTACHMENT_BYTES + 1], Base64.NO_WRAP))}) {
            try { store.saveComposerAttachment(id, invalid); fail("Invalid content must fail"); }
            catch (IllegalStateException expected) { assertEquals(original.toString(), store.getComposerAttachment(id).toString()); }
        }
        assertEquals(1, composerFileCount());
    }

    @Test public void privateComposerDoesNotEnterConversationExports() throws Exception {
        String id = store.createConversation();
        store.saveDraft(id, "private draft"); store.saveComposerAttachment(id, attachment("private file"));
        store.importEncryptedArchive(store.exportEncryptedArchive());
        assertEquals(2, store.list().length());
        assertEquals(1, count("conversation_composers"));
        store.clearAll();
        assertEquals(0, count("conversation_composers")); assertEquals(0, composerFileCount());
    }

    @Test public void failedAttachmentUpdateKeepsThePreviousCommittedFile() throws Exception {
        String id = store.createConversation();
        JSONObject previous = attachment("previous file");
        store.saveComposerAttachment(id, previous);
        store.getWritableDatabase().execSQL("CREATE TRIGGER qa_reject_attachment BEFORE UPDATE OF attachment_file ON conversation_composers BEGIN SELECT RAISE(ABORT, 'qa failure'); END");
        try {
            try { store.saveComposerAttachment(id, attachment("replacement")); fail("Update must fail"); }
            catch (IllegalStateException expected) { }
            assertEquals(previous.toString(), store.getComposerAttachment(id).toString());
            assertEquals(1, composerFileCount());
        } finally { store.getWritableDatabase().execSQL("DROP TRIGGER qa_reject_attachment"); }
    }

    @Test public void failedMessageAcceptanceKeepsTheComposerWithoutPartialTurnOrQueue() throws Exception {
        String id = store.createConversation(); JSONObject selected = attachment("retained file");
        store.saveDraft(id, "retained draft"); store.saveComposerAttachment(id, selected);
        store.getWritableDatabase().execSQL("CREATE TRIGGER qa_reject_queue BEFORE INSERT ON pending_requests BEGIN SELECT RAISE(ABORT, 'qa failure'); END");
        try {
            try { store.acceptUserMessage(id, "question", "question", "fast", selected.toString(), true); fail("Acceptance must fail"); }
            catch (RuntimeException expected) { }
            assertEquals(0, store.get(id).getJSONArray("turns").length()); assertEquals(0, store.pendingCount());
            assertEquals("retained draft", store.getDraft(id)); assertEquals(selected.toString(), store.getComposerAttachment(id).toString());
        } finally { store.getWritableDatabase().execSQL("DROP TRIGGER qa_reject_queue"); }
        store.acceptUserMessage(id, "question", "question", "fast", selected.toString(), true);
        assertEquals(1, store.get(id).getJSONArray("turns").length()); assertEquals(1, store.pendingCount());
        assertEquals("", store.getDraft(id)); assertNull(store.getComposerAttachment(id)); assertEquals(0, composerFileCount());
    }

    @Test public void composerMigrationAndInterruptedWriteCleanupPreserveHistory() throws Exception {
        String id = store.createConversation(); store.addTurn(id, "user", "old history");
        store.getWritableDatabase().execSQL("DROP TABLE conversation_composers");
        store.getWritableDatabase().setVersion(7); store.close();
        store = new LocalChatStore(context);
        assertTrue(store.saveDraft(id, "after migration"));
        assertEquals("old history", store.get(id).getJSONArray("turns").getJSONObject(0).getString("content"));
        File directory = new File(context.getNoBackupFilesDir(), "nexus-composer"); directory.mkdirs();
        File orphan = new File(directory, "00000000-0000-0000-0000-000000000000.nxs");
        assertTrue(orphan.createNewFile());
        store.pruneComposerAttachments();
        assertFalse(orphan.exists()); assertEquals("after migration", store.getDraft(id));
    }

    private long count(String table) {
        try (Cursor rows = store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            assertTrue(rows.moveToFirst()); return rows.getLong(0);
        }
    }

    @Test public void deletingConversationRemovesChildrenAndRetainsOtherChat() {
        String removed = store.createConversation(), retained = store.createConversation();
        store.addTurn(removed, "user", "da eliminare");
        store.addTurn(retained, "user", "da mantenere");
        store.getWritableDatabase().execSQL("INSERT INTO pending_requests(id,conversation_id,prompt,model,created_at) VALUES('qa',?,'p','m',1)", new Object[]{removed});
        store.deleteConversation(removed);
        assertEquals(1, count("turns"));
        assertEquals(0, store.pendingCount());
        assertNotNull(store.get(retained));
        assertNull(store.get(removed));
        store.addTurn(removed, "assistant", "risposta arrivata dopo la cancellazione");
        assertEquals(1, count("turns"));
        assertNull(store.get(removed));
    }

    @Test public void migrationRemovesOnlyPreviouslyOrphanedRows() {
        String retained = store.createConversation();
        store.addTurn(retained, "user", "da mantenere");
        SQLiteDatabase db = store.getWritableDatabase();
        db.setForeignKeyConstraintsEnabled(false);
        db.execSQL("INSERT INTO turns(conversation_id,role,content,created_at) VALUES('missing','user','old',1)");
        db.execSQL("INSERT INTO pending_requests(id,conversation_id,prompt,model,created_at) VALUES('old','missing','p','m',1)");
        db.setVersion(6);
        store.close();
        store = new LocalChatStore(context);
        assertEquals(1, count("turns"));
        assertEquals(0, store.pendingCount());
        assertNotNull(store.get(retained));
        store.deleteConversation(retained);
        assertEquals(0, count("turns"));
    }

    @Test public void legacyPlaintextMigrationPreservesLiteralPrefix() throws Exception {
        store.close();
        SQLiteDatabase legacy = context.openOrCreateDatabase("nexusnxs-chats.db", Context.MODE_PRIVATE, null);
        legacy.execSQL("CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0)");
        legacy.execSQL("CREATE TABLE turns(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
        legacy.execSQL("CREATE TABLE pending_requests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,prompt TEXT NOT NULL,model TEXT NOT NULL,attachment TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)");
        legacy.execSQL("INSERT INTO conversations VALUES('legacy','nexus:v1:titolo',1,1,0,0)");
        legacy.execSQL("INSERT INTO turns(conversation_id,role,content,created_at) VALUES('legacy','user','nexus:v1:testo',1)");
        legacy.setVersion(4);
        legacy.close();
        store = new LocalChatStore(context);
        assertEquals("nexus:v1:titolo", store.get("legacy").getString("title"));
        assertEquals("nexus:v1:testo", store.get("legacy").getJSONArray("turns").getJSONObject(0).getString("content"));
    }

    @Test public void branchingRetainsArtifactsAndRejectsMissingSource() throws Exception {
        String source = store.createConversation();
        store.addTurn(source, "user", "Crea una immagine");
        store.addTurn(source, "assistant", "Creata", "[{\"id\":\"qa-image\",\"mime\":\"image/png\"}]");
        String branch = store.branchConversation(source, 2);
        assertEquals("qa-image", store.get(branch).getJSONArray("turns").getJSONObject(1).getJSONArray("artifacts").getJSONObject(0).getString("id"));
        long before = count("conversations");
        try { store.branchConversation("missing", 3); fail("Missing source must fail"); }
        catch (IllegalArgumentException expected) { assertEquals(before, count("conversations")); }
        assertEquals(2, store.get(source).getJSONArray("turns").length());
    }

    @Test public void codecRoundTripsPrefixTextAndAuthenticatesCiphertext() {
        SecureChatCodec codec = new SecureChatCodec();
        for (String input : new String[]{"Test normale", "nexus:v1:", "nexus:v1:not-base64:nota", "nexus:v1:YWJj:ZGVm", "🌌 ciao"}) {
            String encrypted = codec.encrypt(input);
            assertNotEquals(input, encrypted);
            assertEquals(input, codec.decrypt(encrypted));
        }
        String encrypted = codec.encrypt("conserva questa risposta");
        assertEquals("conserva questa risposta", codec.decrypt(encrypted));
        assertEquals(encrypted, codec.decrypt(codec.encrypt(encrypted)));
        try { codec.decrypt(encrypted.substring(0, encrypted.length() - 8)); fail("Corruption must fail closed"); }
        catch (IllegalStateException expected) { /* Authenticated decryption rejects changes. */ }
    }

    @Test public void prefixTextSurvivesHistoryQueueRenameAndArchive() throws Exception {
        String text = "nexus:v1:un messaggio letterale";
        String id = store.createConversation();
        store.addTurn(id, "user", text);
        store.renameConversation(id, text);
        store.queueRequest(id, text, "fast", "");
        assertEquals(text, store.get(id).getString("title"));
        assertEquals(text, store.get(id).getJSONArray("turns").getJSONObject(0).getString("content"));
        assertEquals(text, store.nextPendingRequest().getString("prompt"));
        assertEquals(1, store.importEncryptedArchive(store.exportEncryptedArchive()));
        assertEquals(2, store.list().length());
        try (Cursor rows = store.getReadableDatabase().rawQuery("SELECT content FROM turns", null)) {
            while (rows.moveToNext()) assertNotEquals(text, rows.getString(0));
        }
    }

    @Test public void backupIncludesArchivedChatsAndArtifactMetadata() throws Exception {
        String id = store.createConversation();
        store.addTurn(id, "assistant", "immagine", "[{\"id\":\"saved-image\"}]");
        store.togglePinned(id);
        store.archiveConversation(id);
        assertEquals(0, store.list().length());
        String archive = store.exportEncryptedArchive();
        store.clearAll();
        assertEquals(1, store.importEncryptedArchive(archive));
        assertEquals(0, store.list().length());
        try (Cursor row = store.getReadableDatabase().rawQuery("SELECT id,pinned,archived FROM conversations", null)) {
            assertTrue(row.moveToFirst());
            assertEquals(1, row.getInt(1));
            assertEquals(1, row.getInt(2));
            assertEquals("saved-image", store.get(row.getString(0)).getJSONArray("turns").getJSONObject(0).getJSONArray("artifacts").getJSONObject(0).getString("id"));
        }
    }
}

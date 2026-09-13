package local.nexus.remote;

import android.content.Context;
import android.database.Cursor;
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
        if (store != null) store.close();
        if (context != null && context.getPackageName().endsWith(".qa")) context.deleteDatabase("nexusnxs-chats.db");
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

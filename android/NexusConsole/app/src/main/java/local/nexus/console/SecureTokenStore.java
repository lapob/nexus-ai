package local.nexus.console;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Conserva la sessione remota cifrata da una chiave non esportabile di Android Keystore. */
final class SecureTokenStore {
    private static final String KEY_ALIAS = "nexus_pc_session_v1";
    private static final String PREFS = "nexus_secure_session";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private final Context context;

    SecureTokenStore(Context context) { this.context = context.getApplicationContext(); }

    String read() {
        try {
            SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String ciphertext = preferences.getString("ciphertext", "");
            String iv = preferences.getString("iv", "");
            if (ciphertext.isEmpty() || iv.isEmpty()) return migrateLegacy();
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception ignored) { clear(); return ""; }
    }

    void write(String token) {
        if (token == null || token.isEmpty()) { clear(); return; }
        try {
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).apply();
            context.getSharedPreferences("NativeMainActivity", Context.MODE_PRIVATE).edit().remove("token").apply();
        } catch (Exception error) { throw new IllegalStateException("Impossibile proteggere la sessione NexusNXS", error); }
    }

    void clear() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        context.getSharedPreferences("NativeMainActivity", Context.MODE_PRIVATE).edit().remove("token").apply();
    }

    private String migrateLegacy() {
        SharedPreferences legacy = context.getSharedPreferences("NativeMainActivity", Context.MODE_PRIVATE);
        String token = legacy.getString("token", "");
        if (!token.isEmpty()) write(token);
        return token;
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
    }
}

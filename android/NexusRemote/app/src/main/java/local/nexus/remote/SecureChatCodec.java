package local.nexus.remote;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Cifratura autenticata dei campi sensibili della cronologia, con chiave non esportabile. */
final class SecureChatCodec {
    private static final String ALIAS = "nexus_ai_chat_history_v1";
    private static final String PREFIX = "nexus:v1:";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    String encrypt(String value) {
        if (value == null || value.isEmpty() || value.startsWith(PREFIX)) return value == null ? "" : value;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            return PREFIX + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        } catch (Exception error) { throw new IllegalStateException("Impossibile cifrare la cronologia NexusNXS", error); }
    }

    String decrypt(String value) {
        if (value == null || value.isEmpty() || !value.startsWith(PREFIX)) return value == null ? "" : value;
        try {
            String[] parts = value.substring(PREFIX.length()).split(":", 2);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception error) { throw new IllegalStateException("Cronologia NexusNXS non decifrabile", error); }
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
    }
}

package local.nexus.console;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

/** Identità non esportabile del telefono, custodita in Android Keystore. */
final class DeviceIdentityStore {
    private static final String PROVIDER = "AndroidKeyStore";
    private static final String ALIAS = "nexusnxs-control-device-v1";

    DeviceIdentityStore(Context ignored) { }

    private KeyStore store() throws Exception {
        KeyStore value = KeyStore.getInstance(PROVIDER);
        value.load(null);
        return value;
    }

    private void ensureKey() throws Exception {
        if (store().containsAlias(ALIAS)) return;
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, PROVIDER);
        generator.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)
            .build());
        generator.generateKeyPair();
    }

    JSONObject enrollment() throws Exception {
        ensureKey();
        byte[] publicKey = store().getCertificate(ALIAS).getPublicKey().getEncoded();
        return new JSONObject()
            .put("algorithm", "ecdsa-p256-sha256")
            .put("publicKey", base64Url(publicKey));
    }

    String signPayload(String encodedPayload) throws Exception {
        ensureKey();
        byte[] payload = Base64.decode(encodedPayload, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        PrivateKey key = (PrivateKey) store().getKey(ALIAS, null);
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(key);
        signature.update(payload);
        return base64Url(signature.sign());
    }

    private static String base64Url(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }
}

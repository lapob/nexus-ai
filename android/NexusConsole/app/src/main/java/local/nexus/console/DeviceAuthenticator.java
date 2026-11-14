package local.nexus.console;

import static android.app.Activity.RESULT_OK;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.hardware.biometrics.BiometricPrompt;
import android.os.CancellationSignal;
import android.widget.Toast;

/**
 * Ogni comando sensibile (Riavvia, Spegni, Arresta server, Riaccendi server)
 * parte soltanto dopo biometria o credenziale del dispositivo. Senza blocco
 * schermo sicuro l'azione fallisce chiusa: non esiste un ramo che la esegua.
 */
final class DeviceAuthenticator {
    static final int REQUEST_DEVICE_CREDENTIAL = 91;
    private final Activity activity;
    private Runnable pendingAuthenticatedAction;

    DeviceAuthenticator(Activity activity) {
        this.activity = activity;
    }

    @SuppressWarnings("deprecation")
    void authenticateThen(Runnable action) {
        if (android.os.Build.VERSION.SDK_INT < 28) {
            KeyguardManager keyguard = activity.getSystemService(KeyguardManager.class);
            if (keyguard == null || !keyguard.isDeviceSecure()) {
                Toast.makeText(activity, "Imposta un blocco schermo sicuro per autorizzare l’operazione.", Toast.LENGTH_LONG).show();
                return;
            }
            Intent confirm = keyguard.createConfirmDeviceCredentialIntent("Conferma l’operazione", "NexusNXS Control");
            if (confirm == null) return;
            pendingAuthenticatedAction = action;
            activity.startActivityForResult(confirm, REQUEST_DEVICE_CREDENTIAL);
            return;
        }
        CancellationSignal cancellation = new CancellationSignal();
        BiometricPrompt.Builder builder = new BiometricPrompt.Builder(activity)
            .setTitle("Conferma l’operazione")
            .setSubtitle("NexusNXS Control");
        if (android.os.Build.VERSION.SDK_INT >= 29) builder.setDeviceCredentialAllowed(true);
        else builder.setNegativeButton("Annulla", activity.getMainExecutor(), (dialog, which) -> { });
        BiometricPrompt prompt = builder.build();
        prompt.authenticate(cancellation, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { action.run(); }
        });
    }

    /** Ritorno dalla credenziale (Android 8): true se il risultato era nostro. */
    boolean handleResult(int requestCode, int resultCode) {
        if (requestCode == REQUEST_DEVICE_CREDENTIAL) {
            Runnable action = pendingAuthenticatedAction;
            pendingAuthenticatedAction = null;
            if (resultCode == RESULT_OK && action != null) action.run();
            return true;
        }
        return false;
    }

    void cancelPending() { pendingAuthenticatedAction = null; }
}

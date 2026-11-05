package com.orchestriq.lifeline;

import android.app.Activity;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint / face unlock.
 * The app's data key is encrypted with an AES key that lives in Android's hardware-backed Keystore and can only
 * be used right after a strong biometric check. Adding a new fingerprint to the phone permanently invalidates it,
 * so someone who learns the phone's PIN cannot enrol their own finger to open Lifeline.
 */
final class BiometricVault {

    private static final String KEY_ALIAS = "lifeline_bio_v1";
    private static final String PREF_IV = "bio_iv";
    private static final String PREF_CT = "bio_ct";

    private BiometricVault() {
    }

    static String status(Context c) {
        if (Build.VERSION.SDK_INT < 30) return "unavailable";
        BiometricManager bm = c.getSystemService(BiometricManager.class);
        if (bm == null) return "unavailable";
        int r = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (r == BiometricManager.BIOMETRIC_SUCCESS) return "available";
        if (r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return "none-enrolled";
        return "unavailable";
    }

    static boolean isEnrolled(Context c) {
        SharedPreferences p = c.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE);
        return p.contains(PREF_CT) && p.contains(PREF_IV);
    }

    private static SecretKey key(boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            if (!create) return (SecretKey) ks.getKey(KEY_ALIAS, null);
            ks.deleteEntry(KEY_ALIAS); // always start enrolment with a fresh key
        } else if (!create) {
            return null;
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) {
            b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        kg.init(b.build());
        return kg.generateKey();
    }

    interface Done {
        void ok(Cipher cipher) throws Exception;
    }

    private static void prompt(final MainActivity a, Cipher cipher, String title, final String cbId, final Done done) {
        if (Build.VERSION.SDK_INT < 30) {
            a.callback(cbId, false, "unsupported");
            return;
        }
        BiometricPrompt p = new BiometricPrompt.Builder(a)
                .setTitle(title)
                .setSubtitle("Lifeline")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButton("Use passcode", a.getMainExecutor(), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        a.callback(cbId, false, "cancelled");
                    }
                })
                .build();
        p.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), a.getMainExecutor(),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        try {
                            done.ok(result.getCryptoObject().getCipher());
                        } catch (Exception e) {
                            a.callback(cbId, false, "crypto-error");
                        }
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence msg) {
                        a.callback(cbId, false, code == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                                || code == BiometricPrompt.BIOMETRIC_ERROR_CANCELED ? "cancelled" : String.valueOf(msg));
                    }
                });
    }

    static void enable(final MainActivity a, final String secretB64, final String cbId) {
        try {
            if (!"available".equals(status(a))) {
                a.callback(cbId, false, "unavailable");
                return;
            }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key(true));
            prompt(a, c, "Turn on fingerprint unlock", cbId, new Done() {
                @Override
                public void ok(Cipher cipher) throws Exception {
                    byte[] ct = cipher.doFinal(Base64.decode(secretB64, Base64.NO_WRAP));
                    a.getSharedPreferences(Bridge.PREFS, Activity.MODE_PRIVATE).edit()
                            .putString(PREF_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                            .putString(PREF_CT, Base64.encodeToString(ct, Base64.NO_WRAP))
                            .apply();
                    a.callback(cbId, true, "enabled");
                }
            });
        } catch (Exception e) {
            a.callback(cbId, false, "error");
        }
    }

    static void unlock(final MainActivity a, final String cbId) {
        try {
            SharedPreferences p = a.getSharedPreferences(Bridge.PREFS, Activity.MODE_PRIVATE);
            String iv = p.getString(PREF_IV, null);
            final String ct = p.getString(PREF_CT, null);
            SecretKey k = key(false);
            if (iv == null || ct == null || k == null) {
                a.callback(cbId, false, "not-enrolled");
                return;
            }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            try {
                c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            } catch (KeyPermanentlyInvalidatedException e) {
                disable(a); // a fingerprint was added/removed: require the passcode again
                a.callback(cbId, false, "invalidated");
                return;
            }
            prompt(a, c, "Unlock Lifeline", cbId, new Done() {
                @Override
                public void ok(Cipher cipher) throws Exception {
                    byte[] secret = cipher.doFinal(Base64.decode(ct, Base64.NO_WRAP));
                    a.callback(cbId, true, Base64.encodeToString(secret, Base64.NO_WRAP));
                }
            });
        } catch (Exception e) {
            a.callback(cbId, false, "error");
        }
    }

    static void disable(Context c) {
        c.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE).edit().remove(PREF_IV).remove(PREF_CT).apply();
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // nothing to remove
        }
    }
}

# Lazysodium JNA
-keep class com.sun.jna.** { *; }
-keep class com.goterl.lazysodium.** { *; }
-dontwarn com.sun.jna.**

# OkHttp
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── WebRTC (calls) ────────────────────────────────────────────────────────────
# Native code calls back into these classes by name.
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# ── Sign in with Google (Credential Manager) ─────────────────────────────────
# Credential Manager finds its Play services provider by class name at run
# time, so R8 can't see that it's used (rule from the Credential Manager docs).
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}

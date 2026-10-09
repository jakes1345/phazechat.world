import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

// ─── Signing credentials from local.properties (gitignored) ───────────────────
// Copy local.properties.example → local.properties and fill in your values.
// Never commit passwords to source control.
val localProps = Properties().also { props ->
    val f = rootProject.file("local.properties")
    if (f.exists()) props.load(f.inputStream())
}
fun localProp(key: String, fallback: String = "") =
    (localProps[key] as? String)?.takeIf { it.isNotBlank() } ?: fallback

// ─── Version ──────────────────────────────────────────────────────────────────
val appVersionCode = 33
val appVersionName = "1.6.5"

android {
    namespace = "world.phazechat.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "world.phazechat.app"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    signingConfigs {
        create("release") {
            // Reads from local.properties — never hardcode credentials here.
            // KEYSTORE_PATH is relative to the android/ project root.
            // Default: app/phaze-release.keystore  (i.e. android/app/phaze-release.keystore)
            storeFile = rootProject.file(localProp("KEYSTORE_PATH", "app/phaze-release.keystore"))
            storePassword = localProp("KEYSTORE_PASS")
            keyAlias = localProp("KEY_ALIAS", "phaze")
            keyPassword = localProp("KEY_PASS")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    // AAB bundle optimisations for Play Store
    bundle {
        language { enableSplit = true }
        density { enableSplit = true }
        abi { enableSplit = true }
    }

    // Store native .so files uncompressed and 16 KB-aligned so Android 15
    // devices with 16 KB page sizes can load them directly from the ZIP.
    // AGP 8.3+ handles the alignment automatically with this flag.
    packaging {
        jniLibs { useLegacyPackaging = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

// AGP 9 compiles Kotlin itself (no kotlin-android plugin); this replaces
// the old android { kotlinOptions { jvmTarget } } block it removed.
kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    // Compose BOM
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    // Newer Material3 no longer pulls this in transitively, and the BOM stopped
    // versioning it (1.7.8 is its final release), so it needs an explicit pin.
    implementation("androidx.compose.material:material-icons-core:1.7.8")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.3")
    // CameraX pulls appcompat, which drags Fragment in at 1.0.0 on the compile
    // classpath. ActivityResult permission requests (QRScannerActivity) need
    // Fragment >= 1.3.0 to route results correctly, so pin it directly.
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.navigation:navigation-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:5.5.0")

    // JSON
    implementation("org.json:json:20260814")

    // Crypto (NaCl via Lazysodium)
    implementation("com.goterl:lazysodium-android:5.2.0@aar")
    implementation("net.java.dev.jna:jna:5.19.1@aar")

    // Core (NotificationCompat for the screen-share foreground service)
    implementation("androidx.core:core-ktx:1.13.1")

    // WebRTC
    implementation("io.getstream:stream-webrtc-android:1.3.10")

    // Firebase Cloud Messaging
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")

    // Image loading
    implementation("io.coil-kt:coil-compose:2.7.0")

    // DataStore for preferences
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // QR Code Scanning (ZXing)
    implementation("com.google.zxing:core:3.5.3")

    // CameraX for QR scanner
    val cameraVersion = "1.4.1"
    implementation("androidx.camera:camera-camera2:$cameraVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraVersion")
    implementation("androidx.camera:camera-view:$cameraVersion")

    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("io.coil-kt:coil-compose:2.7.0")

    testImplementation("junit:junit:4.13.2")
}

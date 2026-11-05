pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Jitsi Meet Android SDK (calls) and the React Native modules it ships
        // with. Same repo as github.com/jitsi/jitsi-maven-repository/raw/master/releases.
        maven {
            url = uri("https://raw.githubusercontent.com/jitsi/jitsi-maven-repository/master/releases")
            content {
                includeGroup("org.jitsi.react")
                includeGroup("com.facebook.react")
            }
        }
    }
}
rootProject.name = "Phaze"
include(":app")

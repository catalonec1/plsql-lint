import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

plugins {
    java
    id("org.jetbrains.intellij.platform") version "2.20.0"
}

group = "io.github.catalonec1"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

// The lint engine lives in core/ (plain Java, tested on its own); compile it into the plugin jar.
sourceSets {
    main {
        java.srcDir("core/src/main/java")
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.3")
        pluginVerifier()
    }
}

intellijPlatform {
    buildSearchableOptions = false
    pluginConfiguration {
        version = project.version.toString()
        // Paid (freemium) plugin: free rules always work, Pro rules + quick fixes need a licence.
        // release-version 10 <-> version 1.0.x; keep both unchanged for 1.0.x bug-fix updates.
        productDescriptor {
            code = "PPLSQLLINT"
            releaseDate = "20261105"
            releaseVersion = "10"
            optional = true
        }
        ideaVersion {
            sinceBuild = "243"
            untilBuild = provider { null }
        }
        changeNotes = """
            <p>1.0.0: first release. 15 free rules, 5 Pro rules, Pro quick fixes, -- noqa suppressions.</p>
        """.trimIndent()
    }
    pluginVerification {
        ides {
            create(IntelliJPlatformType.IntellijIdeaCommunity, "2024.3")
            create(IntelliJPlatformType.DataGrip, "2025.2")
        }
    }
}

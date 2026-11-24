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

// The parser and the checks live in core/ (plain Java, tested on its own); compile them into the plugin jar.
sourceSets {
    main {
        java.srcDir("core/src/main/java")
        resources.srcDir("core/src/main/resources")
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
        // Paid (freemium) plugin: 3 checks free, the other 12 checks need a licence.
        // release-version 10 <-> version 1.0.x; keep both unchanged for 1.0.x bug-fix updates.
        productDescriptor {
            code = "PCATPLANRD"
            releaseDate = "20261108"
            releaseVersion = "10"
            optional = true
        }
        ideaVersion {
            sinceBuild = "243"
            untilBuild = provider { null }
        }
        changeNotes = """
            <p>1.0.0: first release. DBMS_XPLAN parser, 15 checks (3 free), Plan Reader tool window.</p>
        """.trimIndent()
    }
    pluginVerification {
        ides {
            create(IntelliJPlatformType.IntellijIdeaCommunity, "2024.3")
            create(IntelliJPlatformType.DataGrip, "2025.2")
        }
    }
}

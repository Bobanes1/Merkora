// After `tauri android init` (in CI): Merkora's window shows the app from http://localhost:47318, like on the PC,
// so the Dropbox sign-in returns to the same address. Android only allows plain http where it is listed –
// here: localhost only. Run from app/: node scripts/android-patch.cjs
const fs = require('fs');
const path = require('path');
const main = path.join(__dirname, '..', 'src-tauri', 'gen', 'android', 'app', 'src', 'main');
const manifestFile = path.join(main, 'AndroidManifest.xml');
if (!fs.existsSync(manifestFile)) throw new Error('AndroidManifest.xml not found – run `tauri android init` first');

const xmlDir = path.join(main, 'res', 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(
  path.join(xmlDir, 'network_security_config.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`,
);

let m = fs.readFileSync(manifestFile, 'utf8');
if (!m.includes('android:networkSecurityConfig')) {
  m = m.replace(/<application\b/, '<application android:networkSecurityConfig="@xml/network_security_config"');
}
if (!m.includes('android.permission.INTERNET')) {
  m = m.replace(/<application\b/, '<uses-permission android:name="android.permission.INTERNET" />\n    <application');
}
if (!m.includes('android.permission.POST_NOTIFICATIONS')) {
  m = m.replace(/<application\b/, '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application');
}
// In-app updates: Merkora may hand a downloaded APK to the phone's installer (the person still confirms it).
if (!m.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  m = m.replace(/<application\b/, '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <application');
}
if (!m.includes('merkora.updates')) {
  m = m.replace(
    /<\/application>/,
    `    <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.merkora.updates"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_paths" />
        </provider>
    </application>`,
  );
}
fs.writeFileSync(
  path.join(xmlDir, 'update_paths.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <cache-path name="updates" path="updates/" />
</paths>
`,
);
fs.writeFileSync(manifestFile, m);
console.log('Android project patched: localhost http, internet and notification permissions');

// Android 15 draws apps behind the status and navigation bar ("edge to edge"): keep Merkora's content
// clear of them (clock, Wi-Fi, notifications on top; gesture bar at the bottom; also the keyboard).
function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const f = findFile(p, name);
      if (f) return f;
    } else if (e.name === name) return p;
  }
  return null;
}
const activity = findFile(path.join(main, 'java'), 'MainActivity.kt');
if (!activity) throw new Error('MainActivity.kt not found');
const pkg = (fs.readFileSync(activity, 'utf8').match(/^package\s+([\w.]+)/m) || [])[1];
fs.writeFileSync(
  activity,
  `package ${pkg}

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

class MainActivity : TauriActivity() {
  // In-app update: the page downloads the new APK (Rust core) and calls MerkoraAndroid.installApk(path).
  // Only files in Merkora's own folders are accepted; Android's installer asks the person to confirm.
  inner class UpdateBridge {
    @JavascriptInterface
    fun installApk(path: String): String {
      return try {
        val src = File(path).canonicalFile
        val own = listOf(cacheDir, filesDir, dataDir).map { it.canonicalPath }
        if (!src.isFile || own.none { src.path.startsWith(it) } || !src.name.endsWith(".apk")) return "error: not allowed"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
          runOnUiThread {
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          }
          return "permission"
        }
        val dir = File(cacheDir, "updates").apply { mkdirs() }
        val dest = File(dir, "merkora-update.apk")
        if (src.path != dest.canonicalPath) src.copyTo(dest, overwrite = true)
        val uri = FileProvider.getUriForFile(this@MainActivity, packageName + ".merkora.updates", dest)
        val intent = Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        runOnUiThread { startActivity(intent) }
        "ok"
      } catch (e: Exception) {
        "error: " + (e.message ?: e.toString())
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(UpdateBridge(), "MerkoraAndroid")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val root = findViewById<View>(android.R.id.content)
    // the app's background behind the status bar (Merkora's dark teal)
    window.decorView.setBackgroundColor(0xFF0B1514.toInt())
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
`,
);
console.log('MainActivity: content kept clear of the system bars');

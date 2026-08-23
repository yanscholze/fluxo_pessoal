const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_PATH = "com/fluxo/pessoal/notifications";
const SOURCE_DIR = path.join(__dirname, "native", "notifications");
const NATIVE_FILES = [
  "NotificationForwarderService.kt",
  "NotificationBridgeModule.kt",
  "NotificationBridgePackage.kt",
];

function withNotificationListenerManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return mod;

    app.service = app.service ?? [];
    const serviceName = ".notifications.NotificationForwarderService";
    if (!app.service.some((service) => service.$?.["android:name"] === serviceName)) {
      app.service.push({
        $: {
          "android:name": serviceName,
          "android:label": "Fluxo — Lançamentos automáticos",
          "android:exported": "true",
          "android:permission": "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
        },
        "intent-filter": [{
          action: [{ $: { "android:name": "android.service.notification.NotificationListenerService" } }],
        }],
      });
    }
    return mod;
  });
}

function withNotificationListenerSources(config) {
  return withDangerousMod(config, ["android", async (mod) => {
    const targetDir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "java", PACKAGE_PATH);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of NATIVE_FILES) {
      fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(targetDir, file));
    }

    // Registra o NotificationBridgePackage no MainApplication.kt gerado.
    const mainApplicationPath = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "java", "com", "fluxo", "pessoal", "MainApplication.kt");
    if (fs.existsSync(mainApplicationPath)) {
      let contents = fs.readFileSync(mainApplicationPath, "utf8");
      if (!contents.includes("NotificationBridgePackage")) {
        contents = contents.replace(
          'import expo.modules.ExpoReactHostFactory',
          'import expo.modules.ExpoReactHostFactory\nimport com.fluxo.pessoal.notifications.NotificationBridgePackage',
        );
        contents = contents.replace(
          '// Packages that cannot be autolinked yet can be added manually here, for example:\n          // add(MyReactNativePackage())',
          '// Packages that cannot be autolinked yet can be added manually here, for example:\n          // add(MyReactNativePackage())\n          add(NotificationBridgePackage())',
        );
        fs.writeFileSync(mainApplicationPath, contents);
      }
    }
    return mod;
  }]);
}

module.exports = function withNotificationListener(config) {
  config = withNotificationListenerManifest(config);
  config = withNotificationListenerSources(config);
  return config;
};

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function withLockScreenWidgets(config) {
  return withDangerousMod(config, ["android", async (mod) => {
    const xmlDir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
    if (fs.existsSync(xmlDir)) {
      for (const name of fs.readdirSync(xmlDir)) {
        if (!name.startsWith("widgetprovider_")) continue;
        const file = path.join(xmlDir, name);
        const current = fs.readFileSync(file, "utf8");
        fs.writeFileSync(file, current.replace('android:widgetCategory="home_screen"', 'android:widgetCategory="home_screen|keyguard"'));
      }
    }
    return mod;
  }]);
};

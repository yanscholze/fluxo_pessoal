/**
 * O Expo gera os bitmaps e os ícones legacy. Aqui substituímos apenas a
 * referência monochrome por um VectorDrawable real, mantido no código fonte.
 * `android/` é gerado em cada prebuild e não deve ser editado manualmente.
 */
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function withAdaptiveIconVector(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (!app) throw new Error("AndroidManifest sem application para o ícone do Fluxo");
    app.$["android:icon"] = "@mipmap/ic_launcher";
    app.$["android:roundIcon"] = "@mipmap/ic_launcher_round";
    return mod;
  });

  return withDangerousMod(config, ["android", async (mod) => {
    const root = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res");
    const drawable = path.join(root, "drawable");
    fs.mkdirSync(drawable, { recursive: true });
    fs.copyFileSync(path.join(__dirname, "native", "ic_launcher_monochrome.xml"), path.join(drawable, "ic_launcher_monochrome.xml"));

    for (const name of ["ic_launcher", "ic_launcher_round"]) {
      const file = path.join(root, "mipmap-anydpi-v26", `${name}.xml`);
      if (!fs.existsSync(file)) throw new Error(`Ícone adaptativo não gerado pelo Expo: ${name}`);
      const before = fs.readFileSync(file, "utf8");
      const after = before.replace(/<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\s*\/>/, '<monochrome android:drawable="@drawable/ic_launcher_monochrome"/>');
      if (!after.includes('@drawable/ic_launcher_monochrome')) throw new Error(`Camada monochrome ausente em ${name}`);
      fs.writeFileSync(file, after);
    }
    return mod;
  }]);
};

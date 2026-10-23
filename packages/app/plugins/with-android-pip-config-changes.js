const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

// Show window, lane 1: entering picture-in-picture changes the smallest screen width. Without
// smallestScreenSize in configChanges Android recreates the activity there, which restarts the
// whole app under the floating video.
const PIP_CONFIG_CHANGES = ["screenSize", "smallestScreenSize", "screenLayout", "orientation"];

function withAndroidPipConfigChanges(config) {
  return withAndroidManifest(config, (modConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    const current = (activity.$["android:configChanges"] ?? "").split("|").filter(Boolean);
    const merged = [...new Set([...current, ...PIP_CONFIG_CHANGES])];
    activity.$["android:configChanges"] = merged.join("|");
    return modConfig;
  });
}

module.exports = withAndroidPipConfigChanges;

if (process.platform === "win32") await import("./build-windows.mjs");
else if (process.platform === "darwin") {
  const { buildMac } = await import("./build-macos.mjs");
  await buildMac();
} else throw new Error("QQClaw 支持在 Windows 或 macOS 上构建。");

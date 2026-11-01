#pragma once

// Main-thread C interface for the macOS Views browser root. The caller retains
// application RPC/data ownership; this component never exposes model tools.
#ifdef __cplusplus
extern "C" {
#endif
typedef void (*QQClawCefEvent)(const char* json);
#define QQCLAW_CEF_EXPORT __attribute__((visibility("default")))
QQCLAW_CEF_EXPORT int QQClawCefStart(int argc, char** argv, const char* options, QQClawCefEvent event);
QQCLAW_CEF_EXPORT void QQClawCefRun(void);
QQCLAW_CEF_EXPORT void QQClawCefShutdown(void);
QQCLAW_CEF_EXPORT void* QQClawCefWindow(void);                    // Borrowed NSWindow.
QQCLAW_CEF_EXPORT void* QQClawCefCreateShell(void* configuration); // Retained WKWebView.
QQCLAW_CEF_EXPORT void QQClawCefBrowserBounds(int x, int y, int width, int height, int visible);
QQCLAW_CEF_EXPORT const char* QQClawCefState(void);               // Valid until the next call.
QQCLAW_CEF_EXPORT void QQClawCefClose(void);
// UI-only tab/profile controls. These are never registered as model tools.
QQCLAW_CEF_EXPORT const char* QQClawCefControl(const char* json);
#ifdef __cplusplus
}
#endif

#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <QuartzCore/QuartzCore.h>
#include <memory>
#include <map>
#include <set>
#include <deque>
#include <string>
#include <algorithm>
#include "include/cef_app.h"
#include "include/cef_application_mac.h"
#include "include/cef_client.h"
#include "include/cef_command_line.h"
#include "include/cef_frame.h"
#include "include/cef_find_handler.h"
#include "include/cef_download_handler.h"
#include "include/cef_request_context.h"
#include "include/cef_request_context_handler.h"
#include "include/views/cef_browser_view.h"
#include "include/views/cef_browser_view_delegate.h"
#include "include/views/cef_box_layout.h"
#include "include/views/cef_window.h"
#include "include/views/cef_window_delegate.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_library_loader.h"
#include "CefBridge.h"

namespace {
QQClawCefEvent notify = nullptr;
NSDictionary* options;
CefRefPtr<CefWindow> root;
CefRefPtr<CefBrowserView> browserView;
CefRefPtr<CefBrowser> browser;
std::map<int, CefRefPtr<CefBrowser>> pages;
std::map<int, CefRefPtr<CefWindow>> windows;
int windowSequence = 0;
bool rootReported = false;
std::map<std::string, CefRefPtr<CefRequestContext>> profiles;
std::set<std::string> readyProfiles;
std::map<int, std::string> owners;
std::map<int, CefRefPtr<CefBrowserView>> views;
std::map<int, NSString*> titles;
std::set<int> markers;
struct FindJob { NSString* token; std::string query; bool forward; };
struct FindState {
  std::deque<FindJob> queue;
  std::string query;
  bool running = false;
  int last = -1, floor = -1, identifier = -1;
};
std::map<int, FindState> finding;
struct Download {
  int tab = 0;
  std::string owner;
  bool announced = false;
  CefRefPtr<CefBeforeDownloadCallback> before;
  CefRefPtr<CefDownloadItemCallback> callback;
};
std::map<uint32_t, Download> downloads;
std::set<int> retiredPages;
std::set<int> finalizingPages;
std::unique_ptr<CefScopedLibraryLoader> loader;
bool closing = false;
CefRect requestedBounds;
bool requestedVisible = false, hasBounds = false;
std::string layoutSignature;
void layoutBrowser();
bool selectBrowser(CefRefPtr<CefBrowser> value);
void openBrowserWindow(CefRefPtr<CefBrowserView> view, bool activate = true);
void activateWindow(CefRefPtr<CefWindow> window, CefRefPtr<CefBrowserView> view);
NSString* ownerFor(CefRefPtr<CefBrowser> value) {
  for (const auto& entry : profiles) if (entry.second->IsSame(value->GetHost()->GetRequestContext()))
    return @(entry.first.c_str());
  return @"";
}
void emit(NSDictionary* value) {
  NSData* data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  if (notify && data) {
    NSString* text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    notify(text.UTF8String);
  }
}
NSWindow* nativeWindowFor(CefRefPtr<CefWindow> window) {
  if (!window) return nil;
  id handle = (__bridge id)(void*)window->GetWindowHandle();
  if ([handle isKindOfClass:NSWindow.class]) return handle;
  return [handle isKindOfClass:NSView.class] ? [(NSView*)handle window] : nil;
}
NSWindow* nativeWindow() { return nativeWindowFor(root); }
void stopFind(CefRefPtr<CefBrowser> page) {
  auto& state = finding[page->GetIdentifier()];
  state.running = false; state.identifier = -1; state.query.clear();
  auto pending = std::move(state.queue); state.queue.clear();
  page->GetHost()->StopFinding(true);
  for (auto& job : pending) emit(@{@"event": @"find-result", @"token": job.token, @"stale": @YES});
}
void startFind(CefRefPtr<CefBrowser> page) {
  auto& state = finding[page->GetIdentifier()];
  if (state.running || state.queue.empty()) return;
  const auto& job = state.queue.front();
  if (state.query != job.query) { page->GetHost()->StopFinding(true); state.query = job.query; }
  state.running = true; state.floor = state.last; state.identifier = -1;
  page->GetHost()->Find(job.query, job.forward, false, true);
}
bool hasDownload(int tab) {
  for (const auto& entry : downloads) if (entry.second.tab == tab) return true;
  return false;
}
void requestPageClose(CefRefPtr<CefBrowser> page, bool cancel) {
  int tab = page->GetIdentifier();
  retiredPages.insert(tab);
  if (cancel) {
    const auto active = downloads;
    for (const auto& entry : active) if (entry.second.tab == tab) {
      if (entry.second.callback) entry.second.callback->Cancel();
      auto pending = downloads.find(entry.first); if (pending != downloads.end()) pending->second.before = nullptr;
    }
  }
  if (!hasDownload(tab)) page->GetHost()->CloseBrowser(true);
}
}

// WebKit draws the application chrome above the Views root. Its hole reveals
// the real CEF view and returns hit testing to that native view. No input is
// synthesized and no webpage can access this component's control interface.
@interface QQClawCefShell : WKWebView
@property(nonatomic) NSRect browserHole;
@property(nonatomic) BOOL browserVisible;
@end
@implementation QQClawCefShell
- (NSView*)hitTest:(NSPoint)point {
  NSPoint local = [self convertPoint:point fromView:self.superview];
  if (self.browserVisible && NSPointInRect(local, self.browserHole)) return nil;
  return [super hitTest:point];
}
- (void)updateMask {
  self.wantsLayer = YES;
  if (!self.browserVisible) { self.layer.mask = nil; return; }
  CAShapeLayer* mask = [CAShapeLayer layer];
  mask.frame = self.bounds;
  mask.geometryFlipped = self.isFlipped;
  CGMutablePathRef path = CGPathCreateMutable();
  CGPathAddRect(path, nullptr, NSRectToCGRect(self.bounds));
  CGPathAddRect(path, nullptr, NSRectToCGRect(self.browserHole));
  mask.path = path; mask.fillRule = kCAFillRuleEvenOdd;
  CGPathRelease(path); self.layer.mask = mask;
}
@end
namespace { __weak QQClawCefShell* shell; }

@interface QQClawCefApplication : NSApplication <CefAppProtocol> {
  BOOL handlingSendEvent_;
}
@end
@implementation QQClawCefApplication
- (BOOL)isHandlingSendEvent { return handlingSendEvent_; }
- (void)setHandlingSendEvent:(BOOL)value { handlingSendEvent_ = value; }
- (void)sendEvent:(NSEvent*)event {
  CefScopedSendingEvent scope;
  [super sendEvent:event];
}
- (void)terminate:(id)sender {
  // The application must save the backend before explicitly closing CEF.
  emit(@{@"event": @"close-requested"});
}
@end

namespace {
class BrowserClient final : public CefClient, public CefLifeSpanHandler,
                            public CefLoadHandler, public CefDisplayHandler, public CefFindHandler, public CefDownloadHandler {
 public:
  explicit BrowserClient(bool marker = false) : marker_(marker) {}
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  CefRefPtr<CefFindHandler> GetFindHandler() override { return this; }
  CefRefPtr<CefDownloadHandler> GetDownloadHandler() override { return this; }
  bool CanDownload(CefRefPtr<CefBrowser> page, const CefString& url, const CefString& method) override {
    return !closing && ownerFor(page).length > 0 && !retiredPages.count(page->GetIdentifier());
  }
  bool OnBeforeDownload(CefRefPtr<CefBrowser> page, CefRefPtr<CefDownloadItem> item,
                        const CefString& suggested, CefRefPtr<CefBeforeDownloadCallback> callback) override {
    if (closing || retiredPages.count(page->GetIdentifier()) || !ownerFor(page).length || downloads.size() >= 100) return true;
    auto& value = downloads[item->GetId()]; value.tab = page->GetIdentifier(); value.owner = ownerFor(page).UTF8String;
    value.before = callback; value.announced = true;
    emit(@{@"event": @"download-start", @"owner": @(value.owner.c_str()), @"downloadId": @(std::to_string(item->GetId()).c_str()),
      @"tabId": @(value.tab), @"name": @(suggested.ToString().c_str()), @"url": @(item->GetURL().ToString().c_str()), @"total": @(item->GetTotalBytes())});
    return true;
  }
  void OnDownloadUpdated(CefRefPtr<CefBrowser> page, CefRefPtr<CefDownloadItem> item, CefRefPtr<CefDownloadItemCallback> callback) override {
    if (!pages.count(page->GetIdentifier()) || finalizingPages.count(page->GetIdentifier())) { if (item->IsInProgress()) callback->Cancel(); return; }
    const uint32_t id = item->GetId();
    auto& value = downloads[id]; value.tab = page->GetIdentifier(); value.owner = ownerFor(page).UTF8String; value.callback = callback;
    const bool ended = !item->IsInProgress();
    if (value.announced) emit(@{@"event": @"download-progress", @"owner": @(value.owner.c_str()), @"downloadId": @(std::to_string(id).c_str()),
      @"tabId": @(value.tab), @"received": @(item->GetReceivedBytes()), @"total": @(item->GetTotalBytes()),
      @"status": item->IsComplete() ? @"completed" : item->IsCanceled() ? @"cancelled" : ended ? @"interrupted" : @"running"});
    if (ended) {
      downloads.erase(id);
      if (retiredPages.count(page->GetIdentifier()) && !hasDownload(page->GetIdentifier())) page->GetHost()->CloseBrowser(true);
    } else if (closing) callback->Cancel();
  }
  void OnFindResult(CefRefPtr<CefBrowser> page, int identifier, int count, const CefRect& rect, int ordinal, bool final) override {
    auto& state = finding[page->GetIdentifier()]; state.last = std::max(state.last, identifier);
    if (!state.running || identifier <= state.floor) return;
    if (state.identifier < 0) state.identifier = identifier;
    if (identifier != state.identifier || !final) return;
    auto job = state.queue.front(); state.queue.pop_front(); state.running = false;
    emit(@{@"event": @"find-result", @"token": job.token, @"found": @(count > 0), @"total": @(std::max(0, count)), @"index": ordinal > 0 && ordinal <= count ? @(ordinal) : NSNull.null});
    startFind(page);
  }
  void OnAfterCreated(CefRefPtr<CefBrowser> value) override {
    if (pages.empty()) browser = value;
    pages[value->GetIdentifier()] = value;
    if (marker_) markers.insert(value->GetIdentifier());
    NSString* owner = ownerFor(value);
    owners[value->GetIdentifier()] = owner.UTF8String;
    auto view = CefBrowserView::GetForBrowser(value);
    if (view) views[value->GetIdentifier()] = view;
    if (view && browserView && browserView->IsSame(view)) browser = value;
    emit(@{@"event": @"browser-created", @"tabId": @(value->GetIdentifier()), @"owner": owner});
    if (closing) value->GetHost()->CloseBrowser(true);
  }
  void OnBeforeClose(CefRefPtr<CefBrowser> value) override {
    finalizingPages.insert(value->GetIdentifier());
    stopFind(value); finding.erase(value->GetIdentifier());
    retiredPages.erase(value->GetIdentifier());
    for (auto it = downloads.begin(); it != downloads.end();) {
      if (it->second.tab != value->GetIdentifier()) { ++it; continue; }
      auto download = it->second; const auto id = it->first; it = downloads.erase(it);
      if (download.callback) download.callback->Cancel();
      if (download.announced) emit(@{@"event": @"download-progress", @"owner": @(download.owner.c_str()), @"downloadId": @(std::to_string(id).c_str()), @"status": @"interrupted", @"error": @"下载页面已关闭。"});
    }
    if (browser && browser->IsSame(value)) browser = nullptr;
    pages.erase(value->GetIdentifier());
    NSString* owner = @(owners[value->GetIdentifier()].c_str());
    views.erase(value->GetIdentifier()); owners.erase(value->GetIdentifier());
    titles.erase(value->GetIdentifier()); markers.erase(value->GetIdentifier());
    finalizingPages.erase(value->GetIdentifier());
    if (!closing && browserView && browserView->GetBrowser() && browserView->GetBrowser()->IsSame(value)) {
      shell.browserVisible = NO; [shell updateMask];
    }
    emit(@{@"event": @"browser-closed", @"tabId": @(value->GetIdentifier()), @"owner": owner});
    if (closing && pages.empty()) {
      const auto pendingWindows = windows;
      for (const auto& entry : pendingWindows) entry.second->Close();
      if (windows.empty()) CefQuitMessageLoop();
    }
  }
  void OnLoadEnd(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, int status) override {
    if (!frame->IsMain()) return;
    emit(@{@"event": @"load-end", @"owner": ownerFor(value), @"tabId": @(value->GetIdentifier()), @"status": @(status),
           @"url": @(frame->GetURL().ToString().c_str())});
  }
  void OnLoadStart(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, TransitionType transition) override {
    if (frame->IsMain()) { stopFind(value); emit(@{@"event": @"navigation", @"owner": ownerFor(value), @"tabId": @(value->GetIdentifier())}); }
  }
  void OnLoadError(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, ErrorCode code, const CefString& text, const CefString& url) override {
    if (frame->IsMain() && code != ERR_ABORTED) emit(@{@"event": @"load-error", @"owner": ownerFor(value), @"tabId": @(value->GetIdentifier()), @"error": @(text.ToString().c_str())});
  }
  void OnTitleChange(CefRefPtr<CefBrowser> value, const CefString& title) override {
    titles[value->GetIdentifier()] = @(title.ToString().c_str());
    emit(@{@"event": @"title", @"owner": ownerFor(value), @"tabId": @(value->GetIdentifier()), @"title": @(title.ToString().c_str())});
  }
  void OnLoadingStateChange(CefRefPtr<CefBrowser> value, bool loading, bool back, bool forward) override {
    emit(@{@"event": @"loading", @"owner": ownerFor(value), @"tabId": @(value->GetIdentifier()),
      @"loading": @(loading), @"canGoBack": @(back), @"canGoForward": @(forward)});
  }
  void OnAddressChange(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, const CefString& url) override {
    if (frame->IsMain()) emit(@{@"event": @"address", @"owner": ownerFor(value), @"tabId": @(value->GetIdentifier()), @"url": @(url.ToString().c_str())});
  }
 private:
  bool marker_;
  IMPLEMENT_REFCOUNTING(BrowserClient);
};
class BrowserViewDelegate final : public CefBrowserViewDelegate {
 public:
  cef_runtime_style_t GetBrowserRuntimeStyle() override { return CEF_RUNTIME_STYLE_CHROME; }
  ChromeToolbarType GetChromeToolbarType(CefRefPtr<CefBrowserView> value) override { return CEF_CTT_NONE; }
  CefSize GetMinimumSize(CefRefPtr<CefView> view) override { return CefSize(1, 1); }
  bool OnPopupBrowserViewCreated(CefRefPtr<CefBrowserView> opener, CefRefPtr<CefBrowserView> popup, bool is_devtools) override {
    if (!root || is_devtools) return false;
    auto value = popup->GetBrowser();
    if (!value) return false;
    views[value->GetIdentifier()] = popup;
    const bool activate = browserView && opener->IsSame(browserView);
    openBrowserWindow(popup, activate);
    emit(@{@"event": @"popup-adopted", @"tabId": @(value->GetIdentifier()), @"owner": ownerFor(value), @"active": @(activate)});
    return true;
  }
 private:
  IMPLEMENT_REFCOUNTING(BrowserViewDelegate);
};
class RootDelegate final : public CefWindowDelegate {
 public:
  RootDelegate(CefRefPtr<CefBrowserView> view, bool activate) : view_(view), activate_(activate) {}
  void OnWindowCreated(CefRefPtr<CefWindow> window) override {
    window->SetID(++windowSequence); windows[window->GetID()] = window;
    window->AddChildView(view_);
    if (activate_) activateWindow(window, view_); else window->Hide();
    if (!rootReported) { rootReported = true; emit(@{@"event": @"root-created", @"sameProcess": @YES}); }
  }
  void OnWindowDestroyed(CefRefPtr<CefWindow> window) override {
    if (root && root->IsSame(window)) { root = nullptr; browserView = nullptr; browser = nullptr; }
    windows.erase(window->GetID()); view_ = nullptr;
    emit(@{@"event": @"root-closed", @"windowId": @(window->GetID())});
    if (closing && pages.empty() && windows.empty()) CefQuitMessageLoop();
  }
  void OnLayoutChanged(CefRefPtr<CefView> view, const CefRect& bounds) override {
    if (root && view->IsSame(root)) layoutBrowser();
  }
  bool CanClose(CefRefPtr<CefWindow> window) override {
    auto page = view_ ? view_->GetBrowser() : nullptr;
    const bool ready = !page || !page->IsValid() || page->GetHost()->IsReadyToBeClosed();
    // A Chrome Window's BrowserView must be destroyed before its Browser's
    // UnownedUserDataHost. Complete mandatory window closes independently of
    // the other windows. The existing WebKit UI can move to another window.
    if (closing) return ready;
    if (retiring_) return true;
    if (ready) {
      retiring_ = true;
      if (root && root->IsSame(window)) {
        CefBrowserSettings settings;
        auto replacement = CefBrowserView::CreateBrowserView(new BrowserClient, "about:blank#qqclaw-shell", settings,
            nullptr, nullptr, new BrowserViewDelegate);
        requestedVisible = false;
        openBrowserWindow(replacement);
      }
      return true;
    }
    emit(@{@"event": @"close-requested"}); return false;
  }
  CefSize GetPreferredSize(CefRefPtr<CefView> view) override { return CefSize(1100, 760); }
  cef_runtime_style_t GetWindowRuntimeStyle() override { return CEF_RUNTIME_STYLE_CHROME; }
 private:
  CefRefPtr<CefBrowserView> view_;
  bool activate_, retiring_ = false;
  IMPLEMENT_REFCOUNTING(RootDelegate);
};
void openBrowserWindow(CefRefPtr<CefBrowserView> view, bool activate) {
  if (!view) { emit(@{@"event": @"browser-error", @"error": @"The native browser view could not be created"}); return; }
  CefWindow::CreateTopLevelWindow(new RootDelegate(view, activate));
}
void activateWindow(CefRefPtr<CefWindow> window, CefRefPtr<CefBrowserView> view) {
  if (!window || !view) return;
  NSWindow* previous = nativeWindow();
  QQClawCefShell* retainedShell = shell;
  const bool changed = root && !root->IsSame(window);
  CefRefPtr<CefWindow> previousRoot = root;
  root = window; browserView = view; browser = view->GetBrowser();
  NSWindow* next = nativeWindow();
  if (changed && previous && next) {
    [next setFrame:previous.frame display:NO]; next.minSize = previous.minSize;
    next.title = previous.title; next.appearance = previous.appearance;
    next.backgroundColor = previous.backgroundColor;
  }
  if (retainedShell && retainedShell.window != next) {
    [retainedShell removeFromSuperview]; retainedShell.frame = next.contentView.bounds;
    [next.contentView addSubview:retainedShell positioned:NSWindowAbove relativeTo:nil];
    retainedShell.browserVisible = NO; [retainedShell updateMask];
  }
  if (changed) previousRoot->Hide();
  layoutSignature.clear(); layoutBrowser(); window->Show();
  if (changed) emit(@{@"event": @"root-selected", @"windowId": @(window->GetID())});
}
class ProfileHandler final : public CefRequestContextHandler {
 public:
  ProfileHandler(std::string owner, std::string key, bool activate)
      : owner_(std::move(owner)), key_(std::move(key)), activate_(activate) {}
  void OnRequestContextInitialized(CefRefPtr<CefRequestContext> context) override {
    auto found = profiles.find(owner_);
    if (closing || found == profiles.end() || !found->second->IsSame(context)) return;
    // CreateBrowserView returns null until this callback. A newly allocated
    // request context is not yet ready for synchronous Views creation.
    CefBrowserSettings settings;
    auto marker = CefBrowserView::CreateBrowserView(new BrowserClient(true),
        "about:blank#qqclaw-profile-" + key_, settings, nullptr, context, new BrowserViewDelegate);
    auto view = CefBrowserView::CreateBrowserView(new BrowserClient,
        "about:blank#qqclaw-working-" + key_, settings, nullptr, context, new BrowserViewDelegate);
    if (!marker || !view) { emit(@{@"event": @"browser-error", @"owner": @(owner_.c_str()), @"error": @"The profile's native views could not be created"}); return; }
    readyProfiles.insert(owner_);
    openBrowserWindow(marker, false);
    openBrowserWindow(view, activate_);
    emit(@{@"event": @"profile-ready", @"owner": @(owner_.c_str())});
  }
 private:
  std::string owner_, key_;
  bool activate_;
  IMPLEMENT_REFCOUNTING(ProfileHandler);
};
class BrowserApp final : public CefApp, public CefBrowserProcessHandler {
 public:
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
  // chrome.tabs/windows APIs and extension onboarding can create browsers
  // outside CreateBrowserView. They still belong to this application's
  // lifecycle, and must finish closing before CefShutdown.
  CefRefPtr<CefClient> GetDefaultClient() override { return new BrowserClient; }
  void OnBeforeCommandLineProcessing(const CefString& type, CefRefPtr<CefCommandLine> command) override {
    if (!type.empty()) return;
    NSString* extension = options[@"extensionPath"];
    if (extension.length) command->AppendSwitchWithValue("load-extension", extension.UTF8String);
    command->AppendSwitch("no-first-run");
    if ([options[@"diagnostics"] boolValue]) {
      command->AppendSwitchWithValue("enable-logging", "stderr");
      command->AppendSwitchWithValue("vmodule", "native_message*=2,native_process_launcher*=2,extension_service_worker*=2");
    }
  }
  void OnContextInitialized() override {
    CefBrowserSettings settings;
    NSString* url = options[@"url"] ?: @"about:blank";
    browserView = CefBrowserView::CreateBrowserView(new BrowserClient, url.UTF8String,
        settings, nullptr, nullptr, new BrowserViewDelegate);
    openBrowserWindow(browserView);
  }
 private:
  IMPLEMENT_REFCOUNTING(BrowserApp);
};
}

int QQClawCefStart(int argc, char** argv, const char* json, QQClawCefEvent event) {
  if (loader) return 2;
  notify = event;
  NSData* data = [NSData dataWithBytes:json length:strlen(json)];
  id decoded = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![decoded isKindOfClass:NSDictionary.class]) return 3;
  options = decoded;
  NSString* profile = options[@"profile"];
  if (![profile isKindOfClass:NSString.class] || !profile.isAbsolutePath) return 4;
  loader = std::make_unique<CefScopedLibraryLoader>();
  if (!loader->LoadInMain()) { loader.reset(); return 5; }
  [QQClawCefApplication sharedApplication];
  if (![NSApp isKindOfClass:QQClawCefApplication.class]) return 6;
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  CefMainArgs args(argc, argv);
  CefSettings settings;
  // CEF 156 provides a separate real Keychain item per application. Sharing
  // "Chromium Safe Storage" with other CEF apps can wait for their ACL prompt
  // and block shutdown. Keep this name stable across this application's updates.
  NSString* service = [(NSBundle.mainBundle.bundleIdentifier ?: @"com.qqclaw.desktop") stringByAppendingString:@".browser.safe-storage"];
  CefString(&settings.keychain_service_name) = service.UTF8String;
  CefString(&settings.keychain_account_name) = "QQClaw Browser";
  settings.no_sandbox = false;
  settings.use_views_default_popup = true;
  NSString* helperPath = options[@"helperPath"];
  if ([helperPath isKindOfClass:NSString.class] && helperPath.isAbsolutePath)
    CefString(&settings.browser_subprocess_path) = helperPath.UTF8String;
  CefString(&settings.root_cache_path) = profile.UTF8String;
  CefString(&settings.cache_path) = [profile stringByAppendingPathComponent:@"Default"].UTF8String;
  CefString(&settings.log_file) = [profile stringByAppendingPathComponent:@"cef.log"].UTF8String;
  if (!CefInitialize(args, settings, new BrowserApp, nullptr)) return 7;
  return 0;
}
void QQClawCefRun() { CefRunMessageLoop(); }
void QQClawCefShutdown() { profiles.clear(); CefShutdown(); loader.reset(); }
void* QQClawCefWindow() { return (__bridge void*)nativeWindow(); }
void* QQClawCefCreateShell(void* configuration) {
  NSWindow* window = nativeWindow();
  if (!window || !configuration) return nullptr;
  QQClawCefShell* view = [[QQClawCefShell alloc] initWithFrame:window.contentView.bounds
      configuration:(__bridge WKWebViewConfiguration*)configuration];
  view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [window.contentView addSubview:view positioned:NSWindowAbove relativeTo:nil];
  shell = view;
  return (void*)CFBridgingRetain(view);
}
void QQClawCefBrowserBounds(int x, int y, int width, int height, int visible) {
  requestedBounds = CefRect(x, y, width, height);
  requestedVisible = visible && width > 0 && height > 0;
  hasBounds = true;
  layoutBrowser();
}
namespace {
bool selectBrowser(CefRefPtr<CefBrowser> value) {
  if (!value) return false;
  auto found = views.find(value->GetIdentifier());
  if (found == views.end()) return false;
  auto target = found->second->GetWindow();
  if (!target || !windows.count(target->GetID()) || !windows[target->GetID()]->IsSame(target)) return false;
  activateWindow(target, found->second); return true;
}
void layoutBrowser() {
  if (!root || !browserView || !shell || !hasBounds) return;
  NSView* parent = nativeWindow().contentView;
  const auto& b = requestedBounds;
  const int contentWidth = NSWidth(parent.bounds), contentHeight = NSHeight(parent.bounds);
  const std::string signature = std::to_string(contentWidth) + ":" + std::to_string(contentHeight) + ":" +
      std::to_string(b.x) + ":" + std::to_string(b.y) + ":" + std::to_string(b.width) + ":" +
      std::to_string(b.height) + ":" + std::to_string(requestedVisible);
  if (layoutSignature == signature) return;
  layoutSignature = signature;
  // A CefWindow has a default FillLayout which overwrites child SetBounds on
  // the next layout pass. Use the public BoxLayout insets to reserve precisely
  // the application's pane instead of repeatedly fighting the parent layout.
  browserView->SetVisible(requestedVisible);
  CefBoxLayoutSettings settings;
  settings.horizontal = true;
  settings.inside_border_insets.left = b.x;
  settings.inside_border_insets.top = b.y;
  settings.inside_border_insets.right = std::max(0, contentWidth - b.x - b.width);
  settings.inside_border_insets.bottom = std::max(0, contentHeight - b.y - b.height);
  auto layout = root->SetToBoxLayout(settings);
  layout->SetFlexForView(browserView, 1);
  root->Layout();
  shell.browserVisible = requestedVisible;
  NSRect hole = NSMakeRect(b.x, NSHeight(parent.bounds) - b.y - b.height, b.width, b.height);
  shell.browserHole = [shell convertRect:hole fromView:parent];
  [shell updateMask];
}
}
const char* QQClawCefState() {
  NSWindow* window = nativeWindow();
  NSView* content = window.contentView;
  id handle = browser ? (__bridge id)(void*)browser->GetHost()->GetWindowHandle() : nil;
  NSWindow* browserWindow = [handle isKindOfClass:NSWindow.class] ? handle :
      ([handle isKindOfClass:NSView.class] ? [(NSView*)handle window] : nil);
  CefRect bounds = browserView ? browserView->GetBounds() : CefRect();
  NSDictionary* state = @{@"ready": @(browser != nullptr && window != nil),
    @"browserCount": @(pages.size()),
    @"browserWindowMatchesRoot": @(window && browserWindow == window),
    @"shellWindowMatchesRoot": @(window && shell.window == window),
    @"width": @(NSWidth(content.bounds)), @"height": @(NSHeight(content.bounds)),
    @"browserBounds": @[@(bounds.x), @(bounds.y), @(bounds.width), @(bounds.height)],
    @"browserVisible": @(browserView && browserView->IsVisible()),
    @"shellHole": @[@(shell.browserHole.origin.x), @(shell.browserHole.origin.y),
                     @(shell.browserHole.size.width), @(shell.browserHole.size.height)],
    @"hasHoleMask": @(shell.layer.mask != nil)};
  NSData* data = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
  static std::string result;
  result.assign((const char*)data.bytes, data.length);
  return result.c_str();
}
void QQClawCefClose() {
  closing = true;
  const auto open = pages;
  if (!open.empty()) for (const auto& page : open) requestPageClose(page.second, true);
  else {
    const auto pendingWindows = windows;
    for (const auto& entry : pendingWindows) entry.second->Close();
    if (windows.empty()) CefQuitMessageLoop();
  }
}
const char* QQClawCefControl(const char* json) {
  NSData* bytes = [NSData dataWithBytes:json length:strlen(json)];
  NSDictionary* request = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
  NSDictionary* result;
  NSString* action = request[@"action"], *owner = request[@"owner"];
  if (![request isKindOfClass:NSDictionary.class] || ![action isKindOfClass:NSString.class]) {
    result = @{@"error": @"Invalid native browser command"};
  } else if ([action isEqual:@"createProfile"]) {
    NSString* key = request[@"profile"];
    if (![owner isKindOfClass:NSString.class] || ![[NSUUID alloc] initWithUUIDString:owner] ||
        ![key isKindOfClass:NSString.class] || key.length != 32 ||
        [key rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"abcdef0123456789"] invertedSet]].location != NSNotFound || profiles.count(owner.UTF8String)) {
      result = @{@"error": @"Invalid or existing browser profile"};
    } else {
      CefRequestContextSettings settings;
      NSString* directory = [options[@"profile"] stringByAppendingPathComponent:key];
      CefString(&settings.cache_path) = directory.UTF8String;
      auto context = CefRequestContext::CreateContext(settings, new ProfileHandler(owner.UTF8String, key.UTF8String,
          request[@"activate"] == nil || [request[@"activate"] boolValue]));
      profiles[owner.UTF8String] = context;
      NSString* identity = [@"about:blank#qqclaw-profile-" stringByAppendingString:key];
      NSString* initial = [@"about:blank#qqclaw-working-" stringByAppendingString:key];
      result = @{@"created": @YES, @"pending": @YES, @"owner": owner, @"profileDirectory": directory,
        @"identityUrl": identity, @"initialUrl": initial};
    }
  } else if ([action isEqual:@"newTab"]) {
    auto context = [owner isKindOfClass:NSString.class] ? profiles.find(owner.UTF8String) : profiles.end();
    if (context == profiles.end() || !readyProfiles.count(owner.UTF8String)) result = @{@"error": @"The browser profile is not prepared"};
    else {
      CefBrowserSettings settings;
      NSString* key = [@(context->second->GetCachePath().ToString().c_str()) lastPathComponent];
      NSString* initial = [@"about:blank#qqclaw-working-" stringByAppendingString:key];
      auto view = CefBrowserView::CreateBrowserView(new BrowserClient, initial.UTF8String, settings, nullptr, context->second, new BrowserViewDelegate);
      openBrowserWindow(view, request[@"activate"] == nil || [request[@"activate"] boolValue]);
      auto page = view ? view->GetBrowser() : nullptr;
      result = @{@"created": @YES, @"tabId": page ? @(page->GetIdentifier()) : @0};
    }
  } else if ([action isEqual:@"dispose"]) {
    if (![owner isKindOfClass:NSString.class] || ![[NSUUID alloc] initWithUUIDString:owner]) result = @{@"error": @"Invalid browser owner"};
    else {
      const auto open = pages;
      for (const auto& page : open) if (owners[page.first] == owner.UTF8String) requestPageClose(page.second, true);
      readyProfiles.erase(owner.UTF8String); profiles.erase(owner.UTF8String); result = @{@"disposed": @YES};
    }
  } else if ([action isEqual:@"downloadCancel"] || [action isEqual:@"downloadDestination"]) {
    NSString* key = request[@"downloadId"];
    auto found = downloads.end();
    if ([key isKindOfClass:NSString.class]) for (auto it = downloads.begin(); it != downloads.end(); ++it)
      if ([key isEqualToString:@(std::to_string(it->first).c_str())]) { found = it; break; }
    if (found == downloads.end() || ![owner isKindOfClass:NSString.class] || found->second.owner != owner.UTF8String) result = @{@"error": @"The download has ended or belongs to another session"};
    else if ([action isEqual:@"downloadCancel"]) {
      auto active = found->second.callback; found->second.before = nullptr;
      if (active) active->Cancel(); result = @{@"accepted": @YES};
    } else {
      NSString* path = request[@"path"];
      if (![path isKindOfClass:NSString.class] || !path.isAbsolutePath || !found->second.before) result = @{@"error": @"Invalid download destination"};
      else { auto callback = found->second.before; found->second.before = nullptr; callback->Continue(path.UTF8String, false); result = @{@"accepted": @YES}; }
    }
  } else {
    int identifier = [request[@"tabId"] intValue];
    auto found = pages.find(identifier);
    auto owned = owners.find(identifier);
    bool valid = found != pages.end() && [owner isKindOfClass:NSString.class] && owned != owners.end() && owned->second == owner.UTF8String;
    if ([action isEqual:@"tabs"]) {
      NSMutableArray* tabs = [NSMutableArray new];
      for (const auto& page : pages) if (!markers.count(page.first) && !retiredPages.count(page.first) && owners[page.first] == (owner ? owner.UTF8String : "")) {
        auto frame = page.second->GetMainFrame();
        auto view = CefBrowserView::GetForBrowser(page.second);
        id handle = (__bridge id)(void*)page.second->GetHost()->GetWindowHandle();
        NSWindow* window = [handle isKindOfClass:NSWindow.class] ? handle : ([handle isKindOfClass:NSView.class] ? [handle window] : nil);
        [tabs addObject:@{@"id": @(page.first), @"url": frame ? @(frame->GetURL().ToString().c_str()) : @"", @"title": titles[page.first] ?: @"",
          @"loading": @(page.second->IsLoading()), @"canGoBack": @(page.second->CanGoBack()), @"canGoForward": @(page.second->CanGoForward()),
          @"nativeHandleClass": NSStringFromClass([handle class]) ?: @"", @"hasCefView": @(view != nullptr), @"nativeRoot": @(window == nativeWindow()),
          @"attached": @(views.count(page.first) && views[page.first]->GetParentView() && views[page.first]->GetParentView()->IsSame(root))}];
      }
      result = @{@"tabs": tabs};
    } else if (!valid) result = @{@"error": @"The tab does not belong to this session"};
    else {
      auto value = found->second;
      if ([action isEqual:@"selectTab"]) { if (!selectBrowser(value)) result = @{@"error": @"This tab is not embedded in an application window"}; }
      else if ([action isEqual:@"closeTab"]) { requestPageClose(value, false); emit(@{@"event": @"tab-retired", @"owner": owner, @"tabId": @(identifier)}); }
      else if ([action isEqual:@"open"]) {
        NSString* url = request[@"url"]; NSURL* parsed = [url isKindOfClass:NSString.class] ? [NSURL URLWithString:url] : nil;
        if (([parsed.scheme isEqual:@"http"] || [parsed.scheme isEqual:@"https"]) && !parsed.user && !parsed.password) value->GetMainFrame()->LoadURL(url.UTF8String);
        else result = @{@"error": @"Only HTTP/HTTPS pages are supported"};
      } else if ([action isEqual:@"back"]) value->GoBack();
      else if ([action isEqual:@"forward"]) value->GoForward();
      else if ([action isEqual:@"reload"]) value->Reload();
      else if ([action isEqual:@"stop"]) value->StopLoad();
      else if ([action isEqual:@"focus"]) value->GetHost()->SetFocus(true);
      else if ([action isEqual:@"find"]) {
        NSString* operation = request[@"operation"], *query = request[@"query"], *token = request[@"token"];
        if (![@[@"search", @"next", @"previous", @"clear"] containsObject:operation] ||
            ![query isKindOfClass:NSString.class] || query.length > 512 || ![token isKindOfClass:NSString.class]) result = @{@"error": @"Invalid page find request"};
        else {
          std::string term = [query stringByReplacingOccurrencesOfString:@"\r" withString:@""].UTF8String;
          if ([operation isEqual:@"search"] || [operation isEqual:@"clear"] || term.empty() || term != finding[identifier].query) stopFind(value);
          if ([operation isEqual:@"clear"] || term.empty()) result = @{@"cleared": @YES, @"found": @NO, @"total": @0, @"index": NSNull.null};
          else if (finding[identifier].queue.size() >= 64) result = @{@"error": @"Too many pending page find requests"};
          else { finding[identifier].queue.push_back({token, term, ![operation isEqual:@"previous"]}); startFind(value); result = @{@"pending": @YES}; }
        }
      }
      else result = @{@"error": @"Unsupported native browser command"};
      if (!result) result = @{@"accepted": @YES};
    }
  }
  NSData* data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
  static std::string output; output.assign((const char*)data.bytes, data.length); return output.c_str();
}

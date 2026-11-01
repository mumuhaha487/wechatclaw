#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <QuartzCore/QuartzCore.h>
#include <memory>
#include <string>
#include <algorithm>
#include "include/cef_app.h"
#include "include/cef_application_mac.h"
#include "include/cef_client.h"
#include "include/cef_command_line.h"
#include "include/cef_frame.h"
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
std::unique_ptr<CefScopedLibraryLoader> loader;
bool closing = false;
CefRect requestedBounds;
bool requestedVisible = false, hasBounds = false;
std::string layoutSignature;
void layoutBrowser();
void emit(NSDictionary* value) {
  NSData* data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  if (notify && data) {
    NSString* text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    notify(text.UTF8String);
  }
}
NSWindow* nativeWindow() {
  if (!root) return nil;
  id handle = (__bridge id)(void*)root->GetWindowHandle();
  if ([handle isKindOfClass:NSWindow.class]) return handle;
  return [handle isKindOfClass:NSView.class] ? [(NSView*)handle window] : nil;
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
                            public CefLoadHandler, public CefDisplayHandler {
 public:
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  void OnAfterCreated(CefRefPtr<CefBrowser> value) override {
    browser = value;
    emit(@{@"event": @"browser-created", @"tabId": @(value->GetIdentifier())});
  }
  void OnBeforeClose(CefRefPtr<CefBrowser> value) override {
    if (browser && browser->IsSame(value)) browser = nullptr;
    emit(@{@"event": @"browser-closed", @"tabId": @(value->GetIdentifier())});
    if (closing && root) root->Close();
  }
  void OnLoadEnd(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, int status) override {
    if (!frame->IsMain()) return;
    emit(@{@"event": @"load-end", @"status": @(status),
           @"url": @(frame->GetURL().ToString().c_str())});
  }
  void OnTitleChange(CefRefPtr<CefBrowser> value, const CefString& title) override {
    emit(@{@"event": @"title", @"title": @(title.ToString().c_str())});
  }
 private:
  IMPLEMENT_REFCOUNTING(BrowserClient);
};
class BrowserViewDelegate final : public CefBrowserViewDelegate {
 public:
  cef_runtime_style_t GetBrowserRuntimeStyle() override { return CEF_RUNTIME_STYLE_CHROME; }
  ChromeToolbarType GetChromeToolbarType(CefRefPtr<CefBrowserView> value) override { return CEF_CTT_NONE; }
  CefSize GetMinimumSize(CefRefPtr<CefView> view) override { return CefSize(1, 1); }
 private:
  IMPLEMENT_REFCOUNTING(BrowserViewDelegate);
};
class RootDelegate final : public CefWindowDelegate {
 public:
  void OnWindowCreated(CefRefPtr<CefWindow> window) override {
    root = window;
    window->AddChildView(browserView);
    window->Show();
    emit(@{@"event": @"root-created", @"sameProcess": @YES});
  }
  void OnWindowDestroyed(CefRefPtr<CefWindow> window) override {
    root = nullptr; browserView = nullptr;
    emit(@{@"event": @"root-closed"});
    CefQuitMessageLoop();
  }
  void OnLayoutChanged(CefRefPtr<CefView> view, const CefRect& bounds) override {
    layoutBrowser();
  }
  bool CanClose(CefRefPtr<CefWindow> window) override {
    if (!closing) { emit(@{@"event": @"close-requested"}); return false; }
    return !browser || browser->GetHost()->TryCloseBrowser();
  }
  CefSize GetPreferredSize(CefRefPtr<CefView> view) override { return CefSize(1100, 760); }
  cef_runtime_style_t GetWindowRuntimeStyle() override { return CEF_RUNTIME_STYLE_CHROME; }
 private:
  IMPLEMENT_REFCOUNTING(RootDelegate);
};
class BrowserApp final : public CefApp, public CefBrowserProcessHandler {
 public:
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
  void OnBeforeCommandLineProcessing(const CefString& type, CefRefPtr<CefCommandLine> command) override {
    if (!type.empty()) return;
    NSString* extension = options[@"extensionPath"];
    if (extension.length) command->AppendSwitchWithValue("load-extension", extension.UTF8String);
    command->AppendSwitch("no-first-run");
  }
  void OnContextInitialized() override {
    CefBrowserSettings settings;
    NSString* url = options[@"url"] ?: @"about:blank";
    browserView = CefBrowserView::CreateBrowserView(new BrowserClient, url.UTF8String,
        settings, nullptr, nullptr, new BrowserViewDelegate);
    CefWindow::CreateTopLevelWindow(new RootDelegate);
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
  settings.no_sandbox = false;
  CefString(&settings.root_cache_path) = profile.UTF8String;
  CefString(&settings.cache_path) = [profile stringByAppendingPathComponent:@"Default"].UTF8String;
  CefString(&settings.log_file) = [profile stringByAppendingPathComponent:@"cef.log"].UTF8String;
  if (!CefInitialize(args, settings, new BrowserApp, nullptr)) return 7;
  return 0;
}
void QQClawCefRun() { CefRunMessageLoop(); }
void QQClawCefShutdown() { CefShutdown(); loader.reset(); }
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
  if (browser) browser->GetHost()->CloseBrowser(true);
  else if (root) root->Close();
  else CefQuitMessageLoop();
}

#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <QuartzCore/QuartzCore.h>
#include <memory>
#include <map>
#include <string>
#include <algorithm>
#include "include/cef_app.h"
#include "include/cef_application_mac.h"
#include "include/cef_client.h"
#include "include/cef_command_line.h"
#include "include/cef_frame.h"
#include "include/cef_request_context.h"
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
std::map<std::string, CefRefPtr<CefRequestContext>> profiles;
std::map<int, std::string> owners;
std::map<int, CefRefPtr<CefBrowserView>> views;
std::map<int, NSString*> titles;
std::unique_ptr<CefScopedLibraryLoader> loader;
bool closing = false;
CefRect requestedBounds;
bool requestedVisible = false, hasBounds = false;
std::string layoutSignature;
void layoutBrowser();
void selectBrowser(CefRefPtr<CefBrowser> value);
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
    if (pages.empty()) browser = value;
    pages[value->GetIdentifier()] = value;
    NSString* owner = ownerFor(value);
    owners[value->GetIdentifier()] = owner.UTF8String;
    auto view = CefBrowserView::GetForBrowser(value);
    if (view) views[value->GetIdentifier()] = view;
    emit(@{@"event": @"browser-created", @"tabId": @(value->GetIdentifier()), @"owner": owner});
    if (closing) value->GetHost()->CloseBrowser(true);
  }
  void OnBeforeClose(CefRefPtr<CefBrowser> value) override {
    if (browser && browser->IsSame(value)) browser = nullptr;
    pages.erase(value->GetIdentifier());
    NSString* owner = @(owners[value->GetIdentifier()].c_str());
    views.erase(value->GetIdentifier()); owners.erase(value->GetIdentifier());
    titles.erase(value->GetIdentifier());
    if (!closing && browserView && browserView->GetBrowser() && browserView->GetBrowser()->IsSame(value)) {
      shell.browserVisible = NO; [shell updateMask];
    }
    emit(@{@"event": @"browser-closed", @"tabId": @(value->GetIdentifier()), @"owner": owner});
    if (closing && pages.empty()) {
      if (root) root->Close(); else CefQuitMessageLoop();
    }
  }
  void OnLoadEnd(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, int status) override {
    if (!frame->IsMain()) return;
    emit(@{@"event": @"load-end", @"tabId": @(value->GetIdentifier()), @"status": @(status),
           @"url": @(frame->GetURL().ToString().c_str())});
  }
  void OnTitleChange(CefRefPtr<CefBrowser> value, const CefString& title) override {
    titles[value->GetIdentifier()] = @(title.ToString().c_str());
    emit(@{@"event": @"title", @"tabId": @(value->GetIdentifier()), @"title": @(title.ToString().c_str())});
  }
  void OnLoadingStateChange(CefRefPtr<CefBrowser> value, bool loading, bool back, bool forward) override {
    emit(@{@"event": @"loading", @"tabId": @(value->GetIdentifier()),
      @"loading": @(loading), @"canGoBack": @(back), @"canGoForward": @(forward)});
  }
  void OnAddressChange(CefRefPtr<CefBrowser> value, CefRefPtr<CefFrame> frame, const CefString& url) override {
    if (frame->IsMain()) emit(@{@"event": @"address", @"tabId": @(value->GetIdentifier()), @"url": @(url.ToString().c_str())});
  }
 private:
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
    selectBrowser(value);
    emit(@{@"event": @"popup-adopted", @"tabId": @(value->GetIdentifier()), @"owner": ownerFor(value)});
    return true;
  }
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
    if (pages.empty()) CefQuitMessageLoop();
  }
  void OnLayoutChanged(CefRefPtr<CefView> view, const CefRect& bounds) override {
    layoutBrowser();
  }
  bool CanClose(CefRefPtr<CefWindow> window) override {
    if (!closing) { emit(@{@"event": @"close-requested"}); return false; }
    return pages.empty();
  }
  CefSize GetPreferredSize(CefRefPtr<CefView> view) override { return CefSize(1100, 760); }
  cef_runtime_style_t GetWindowRuntimeStyle() override { return CEF_RUNTIME_STYLE_CHROME; }
 private:
  IMPLEMENT_REFCOUNTING(RootDelegate);
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
void selectBrowser(CefRefPtr<CefBrowser> value) {
  if (!root || !value) return;
  auto found = views.find(value->GetIdentifier());
  if (found == views.end()) return;
  auto next = found->second;
  auto parent = next->GetParentView();
  if (parent && !parent->IsSame(root)) {
    emit(@{@"event": @"adoption-rejected", @"tabId": @(value->GetIdentifier())}); return;
  }
  if (browserView && !browserView->IsSame(next)) root->RemoveChildView(browserView);
  browserView = next; browser = value;
  if (!browserView->GetParentView()) root->AddChildView(browserView);
  layoutSignature.clear(); layoutBrowser();
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
  if (!open.empty()) for (const auto& page : open) page.second->GetHost()->CloseBrowser(true);
  else if (root) root->Close();
  else CefQuitMessageLoop();
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
      auto context = CefRequestContext::CreateContext(settings, nullptr);
      profiles[owner.UTF8String] = context;
      CefBrowserSettings browserSettings;
      auto view = CefBrowserView::CreateBrowserView(new BrowserClient, "about:blank", browserSettings, nullptr, context, new BrowserViewDelegate);
      if (browserView && browserView->GetParentView()) root->RemoveChildView(browserView);
      browserView = view; root->AddChildView(view);
      layoutSignature.clear(); layoutBrowser();
      result = @{@"created": @YES, @"owner": owner, @"profileDirectory": directory};
    }
  } else {
    int identifier = [request[@"tabId"] intValue];
    auto found = pages.find(identifier);
    auto owned = owners.find(identifier);
    bool valid = found != pages.end() && [owner isKindOfClass:NSString.class] && owned != owners.end() && owned->second == owner.UTF8String;
    if ([action isEqual:@"tabs"]) {
      NSMutableArray* tabs = [NSMutableArray new];
      for (const auto& page : pages) if (owners[page.first] == (owner ? owner.UTF8String : "")) {
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
      if ([action isEqual:@"selectTab"]) selectBrowser(value);
      else if ([action isEqual:@"closeTab"]) value->GetHost()->CloseBrowser(false);
      else if ([action isEqual:@"open"]) {
        NSString* url = request[@"url"]; NSURL* parsed = [url isKindOfClass:NSString.class] ? [NSURL URLWithString:url] : nil;
        if (([parsed.scheme isEqual:@"http"] || [parsed.scheme isEqual:@"https"]) && !parsed.user && !parsed.password) value->GetMainFrame()->LoadURL(url.UTF8String);
        else result = @{@"error": @"Only HTTP/HTTPS pages are supported"};
      } else if ([action isEqual:@"back"]) value->GoBack();
      else if ([action isEqual:@"forward"]) value->GoForward();
      else if ([action isEqual:@"reload"]) value->Reload();
      else if ([action isEqual:@"stop"]) value->StopLoad();
      else if ([action isEqual:@"focus"]) value->GetHost()->SetFocus(true);
      else result = @{@"error": @"Unsupported native browser command"};
      if (!result) result = @{@"accepted": @YES};
    }
  }
  NSData* data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
  static std::string output; output.assign((const char*)data.bytes, data.length); return output.c_str();
}

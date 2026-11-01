#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <cstring>
#include <cstdio>
#include "CefBridge.h"

// Isolated integration entry, used only by the macOS CI check. It loads no
// product accounts and exposes no page automation interface of its own.
static WKWebView* shell;
static void event(const char* text) {
  printf("EVENT %s\n", text); fflush(stdout);
  NSDictionary* value = [NSJSONSerialization JSONObjectWithData:
      [NSData dataWithBytes:text length:strlen(text)] options:0 error:nil];
  if ([value[@"event"] isEqual:@"root-created"]) {
    WKWebViewConfiguration* config = [WKWebViewConfiguration new];
    config.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
    shell = (__bridge_transfer WKWebView*)QQClawCefCreateShell((__bridge void*)config);
    [shell loadHTMLString:@"<!doctype html><title>Official extension integration</title><style>body{background:white;color:black;font:16px system-ui}</style><p>Isolated QQClaw browser component</p>" baseURL:nil];
    QQClawCefBrowserBounds(650,80,400,600,1);
  }
  if ([value[@"event"] isEqual:@"close-requested"]) QQClawCefClose();
}
int main(int argc, char** argv) { @autoreleasepool {
  NSDictionary* env = NSProcessInfo.processInfo.environment;
  NSData* options = [NSData dataWithContentsOfFile:env[@"QQCLAW_CHECK_OPTIONS"]];
  if (!options) return 10;
  NSString* json = [[NSString alloc] initWithData:options encoding:NSUTF8StringEncoding];
  int status = QQClawCefStart(argc, argv, json.UTF8String, event);
  if (status) { fprintf(stderr,"CEF start failed: %d\n",status); return status; }
  [NSTimer scheduledTimerWithTimeInterval:0.2 repeats:YES block:^(NSTimer* timer) {
    if ([[NSFileManager defaultManager] fileExistsAtPath:env[@"QQCLAW_CHECK_STOP"]]) {
      [timer invalidate]; QQClawCefClose();
    }
  }];
  QQClawCefRun(); QQClawCefShutdown(); return 0;
} }

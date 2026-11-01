// QQClaw's native browser surface. Model automation belongs exclusively to the
// unmodified official ChatGPT extension; this pipe serves the application's UI.
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <tlhelp32.h>
#include <atomic>
#include <algorithm>
#include <deque>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>
#include <nlohmann/json.hpp>
#define CEF_API_VERSION 15400
#include "include/capi/cef_app_capi.h"
#include "include/capi/cef_client_capi.h"
#include "include/capi/cef_display_handler_capi.h"
#include "include/capi/cef_download_handler_capi.h"
#include "include/capi/cef_find_handler_capi.h"
#include "include/capi/cef_keyboard_handler_capi.h"
#include "include/capi/cef_focus_handler_capi.h"
#include "include/capi/cef_life_span_handler_capi.h"
#include "include/capi/cef_load_handler_capi.h"
#include "include/capi/cef_parser_capi.h"
#include "include/capi/cef_request_handler_capi.h"
#include "include/capi/cef_task_capi.h"
#include "include/cef_sandbox_win.h"

using Json = nlohmann::json;
namespace {
HMODULE library;
#define API(name) reinterpret_cast<decltype(&name)>(GetProcAddress(library, #name))
template<class T> struct Object {
  T value{};
  std::atomic<int> refs{1};
  Json data;
  Object() {
    value.base.size=sizeof(T); value.base.add_ref=add; value.base.release=drop;
    value.base.has_one_ref=one; value.base.has_at_least_one_ref=any;
  }
  static Object* object(cef_base_ref_counted_t* p) { return reinterpret_cast<Object*>(p); }
  static void CEF_CALLBACK add(cef_base_ref_counted_t* p) { object(p)->refs.fetch_add(1); }
  static int CEF_CALLBACK drop(cef_base_ref_counted_t* p) { auto* o=object(p); if(o->refs.fetch_sub(1)==1){delete o; return 1;} return 0; }
  static int CEF_CALLBACK one(cef_base_ref_counted_t* p) { return object(p)->refs.load()==1; }
  static int CEF_CALLBACK any(cef_base_ref_counted_t* p) { return object(p)->refs.load()>0; }
};
template<class T> T* owned(Object<T>* o) { o->value.base.add_ref(&o->value.base); return &o->value; }
template<class T> void release(T* p) { if(p) {auto* base=reinterpret_cast<cef_base_ref_counted_t*>(p);base->release(base);} }
struct FindRequest {
  Json request;
  std::wstring query;
  bool forward;
};
struct Page {
  cef_browser_t* browser;
  std::string title, url="about:blank", error;
  bool loading=false, back=false, forward=false;
  std::deque<FindRequest> findQueue;
  std::wstring findQuery;
  bool finding=false;
  bool findOpen=false, historyLoaded=false;
  int lastFindIdentifier=-1, findFloor=-1, findIdentifier=-1;
  ULONGLONG findStarted=0;
};
Object<cef_app_t>* app;
Object<cef_client_t>* client;
Object<cef_browser_process_handler_t>* process;
Object<cef_life_span_handler_t>* lifetime;
Object<cef_display_handler_t>* display;
Object<cef_load_handler_t>* load;
Object<cef_request_handler_t>* requests;
Object<cef_focus_handler_t>* focus;
Object<cef_find_handler_t>* finder;
Object<cef_keyboard_handler_t>* keyboard;
Object<cef_download_handler_t>* downloadHandlerObject;
struct Download {
  int tab=0;
  cef_before_download_callback_t* before=nullptr;
  cef_download_item_callback_t* callback=nullptr;
  ULONGLONG lastSent=0;
};
std::map<uint32_t,Download> downloads;
std::map<int, Page> pages;
std::map<int, std::vector<Json>> closingRequests;
std::set<int> closeRequested, closeSent;
std::vector<Json> shutdownRequests;
Json config;
std::string owner;
std::wstring profile, extension;
HWND surface=nullptr;
int active=0, width=1000, height=760;
bool visible=false, closing=false;
bool creatingForUi=false;
bool readySent=false;
uint64_t revision=0;
uint64_t viewUpdates=0;
HANDLE input=INVALID_HANDLE_VALUE, output=INVALID_HANDLE_VALUE, readerHandle=nullptr;
std::mutex writeGate;
std::atomic<bool> stopping{false};
std::thread reader;

std::wstring wide(const std::string& value) {
  int n=MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), int(value.size()), nullptr, 0);
  if(!value.empty() && !n) throw std::runtime_error("Invalid UTF-8");
  std::wstring result(n, L'\0'); MultiByteToWideChar(CP_UTF8,0,value.data(),int(value.size()),result.data(),n); return result;
}
std::string utf8(const cef_string_t* value) {
  if(!value || !value->length) return "";
  auto chars=reinterpret_cast<const wchar_t*>(value->str);
  int n=WideCharToMultiByte(CP_UTF8,0,chars,int(value->length),nullptr,0,nullptr,nullptr);
  std::string result(n,'\0'); WideCharToMultiByte(CP_UTF8,0,chars,int(value->length),result.data(),n,nullptr,nullptr); return result;
}
cef_string_t text(const std::wstring& value) {
  cef_string_t result{}; result.str=reinterpret_cast<char16_t*>(const_cast<wchar_t*>(value.c_str())); result.length=value.size(); return result;
}
std::string returnedString(cef_string_userfree_t value) {
  // Download metadata legitimately returns null before the destination/name
  // exists. CEF's userfree release function does not accept that null value.
  if(!value)return "";
  auto result=utf8(value);API(cef_string_userfree_utf16_free)(value);return result;
}
void write(const Json& value) {
  if(output==INVALID_HANDLE_VALUE) return;
  const std::string bytes=value.dump(-1,' ',false,Json::error_handler_t::replace)+"\n";
  std::lock_guard<std::mutex> guard(writeGate);
  size_t offset=0; DWORD sent;
  while(offset<bytes.size()) {
    if(!WriteFile(output,bytes.data()+offset,DWORD(std::min<size_t>(bytes.size()-offset,65536)),&sent,nullptr)||!sent) break;
    offset+=sent;
  }
}
void answer(const Json& request, const Json& result, const std::string& error="") {
  if(request.contains("id")) write({{"id",request["id"]},{"result",result},{"error",error.empty()?Json(nullptr):Json(error)}});
}
void stopFind(Page& page, const std::string& error="", bool clearNative=true) {
  // Invalidate before StopFinding, including any synchronous notifications.
  page.finding=false; page.findIdentifier=-1; page.findQuery.clear();
  auto pending=std::move(page.findQueue); page.findQueue.clear();
  if(clearNative) {auto* host=page.browser->get_host(page.browser); host->stop_finding(host,1); release(host);}
  for(auto& request:pending) answer(request.request,{{"stale",true}},error);
}
void startFind(Page& page) {
  if(page.finding || page.findQueue.empty()) return;
  auto query=page.findQueue.front().query;
  auto* host=page.browser->get_host(page.browser);
  if(query!=page.findQuery) {
    host->stop_finding(host,1); page.findQuery=query;
  }
  page.finding=true; page.findFloor=page.lastFindIdentifier;
  page.findIdentifier=-1; page.findStarted=GetTickCount64();
  auto value=text(query);
  // CEF 154 forwards findNext as Chromium's find_match. A fresh session
  // with true selects a match as well as counting/highlighting the results.
  host->find(host,&value,page.findQueue.front().forward,0,1); release(host);
}
void find(Page& page, const Json& request) {
  const auto operation=request.value("operation","");
  auto query=wide(request.value("query",""));
  if((operation!="search" && operation!="next" && operation!="previous" && operation!="clear") || query.size()>512)
    throw std::runtime_error("Invalid page find parameters");
  if(operation=="search" || operation=="clear") page.findOpen=operation!="clear";
  // Chromium removes CR itself. Handle an empty normalized query here: its
  // StartFinding would clear without ever returning a final find callback.
  query.erase(std::remove(query.begin(),query.end(),L'\r'),query.end());
  if(operation=="search" || operation=="clear" || query.empty() || query!=page.findQuery) stopFind(page);
  if(operation=="clear" || query.empty()) {answer(request,{{"cleared",true},{"found",false},{"total",0},{"index",nullptr}});return;}
  if(page.findQueue.size()>=64) throw std::runtime_error("Too many pending page find requests");
  page.findQueue.push_back({request,std::move(query),operation!="previous"}); startFind(page);
}
void CEF_CALLBACK findResult(cef_find_handler_t*,cef_browser_t* browser,int identifier,int count,const cef_rect_t*,int ordinal,int finalUpdate) {
  auto entry=pages.find(browser->get_identifier(browser));
  if(entry!=pages.end()) {
    auto& page=entry->second;
    // Chromium owns these IDs. Never equate them to our pipe request IDs.
    // Only one native request per page is in flight; old final callbacks must
    // not finish the next queued next/previous operation.
    page.lastFindIdentifier=std::max(page.lastFindIdentifier,identifier);
    if(page.finding && identifier>page.findFloor) {
      if(page.findIdentifier<0) page.findIdentifier=identifier;
      if(identifier==page.findIdentifier && finalUpdate) {
        auto request=page.findQueue.front().request; page.findQueue.pop_front(); page.finding=false;
        if(count<0) answer(request,nullptr,"The page did not return a complete find result");
        else answer(request,{{"found",count>0},{"total",count},{"index",ordinal>0&&ordinal<=count?Json(ordinal):Json(nullptr)}});
        startFind(page);
      }
    }
  }
  release(browser);
}
std::string id(int browser) { return browser>0 ? "cef:"+std::to_string(browser) : ""; }
int browserId(const Json& request) {
  std::string value=request.value("tabId","");
  if(value.empty()) return active;
  if(value.rfind("cef:",0)!=0 || value.size()>15) throw std::runtime_error("Invalid tab ID");
  int found=std::stoi(value.substr(4));
  if(id(found)!=value) throw std::runtime_error("Invalid tab ID");
  return found;
}
Json state(bool reveal=false) {
  Json tabs=Json::array();
  for(auto& [key,page]:pages) tabs.push_back({{"id",id(key)},{"title",page.title},{"url",page.url},{"loading",page.loading}});
  Page* page=pages.count(active)?&pages.at(active):nullptr;
  RECT bounds{}; if(surface) GetClientRect(surface,&bounds);
  std::set<HWND> windows;size_t attached=0;
  for(auto& [key,item]:pages) {auto* host=item.browser->get_host(item.browser);HWND window=host->get_window_handle(host);release(host);if(window)windows.insert(window);}
  for(HWND window:windows) {DWORD pid=0;GetWindowThreadProcessId(window,&pid);if(pid==GetCurrentProcessId()&&GetParent(window)==surface)attached++;}
  return {{"owner",owner},{"revision",++revision},{"engine","cef"},{"reveal",reveal},{"activeTab",id(page?active:0)},
    {"tabs",tabs},{"url",page?page->url:""},{"title",page?page->title:""},{"error",page?page->error:""},
    {"loading",page&&page->loading},{"canGoBack",page&&page->back},{"canGoForward",page&&page->forward},
    {"chromeControlsVisible",true},{"surface",{{"width",bounds.right-bounds.left},{"height",bounds.bottom-bounds.top},{"visible",visible},{"viewUpdates",viewUpdates},{"nativeWindowCount",windows.size()},{"attachedOwnedWindowCount",attached}}}};
}
void publish(bool reveal=false) { write({{"event","state"},{"data",state(reveal)}}); }
void layout() {
  if(!surface) return;
  std::set<HWND> windows;
  HWND selected=nullptr;
  for(auto& [key,page]:pages) {
    auto* host=page.browser->get_host(page.browser); HWND window=host->get_window_handle(host); release(host);
    DWORD pid=0; GetWindowThreadProcessId(window,&pid);
    if(!window || pid!=GetCurrentProcessId()) continue;
    windows.insert(window); if(key==active) selected=window;
  }
  for(HWND window:windows) {
    if(GetParent(window)!=surface) {
      ShowWindow(window,SW_HIDE); SetLastError(0); HWND previous=SetParent(window,surface);
      if(previous==nullptr && GetLastError()!=0) {write({{"event","error"},{"error","Could not attach the owned CEF window"}}); continue;}
      auto style=GetWindowLongPtrW(window,GWL_STYLE);
      SetWindowLongPtrW(window,GWL_STYLE,(style&~(WS_POPUP|WS_CAPTION|WS_THICKFRAME|WS_SYSMENU|WS_MINIMIZEBOX|WS_MAXIMIZEBOX))|WS_CHILD|WS_CLIPCHILDREN|WS_CLIPSIBLINGS);
    }
    RECT current{};GetClientRect(window,&current);
    if(current.right-current.left!=width || current.bottom-current.top!=height)
      SetWindowPos(window,nullptr,0,0,width,height,SWP_NOZORDER|SWP_NOACTIVATE|SWP_FRAMECHANGED);
    const bool show=visible&&window==selected;
    if(((GetWindowLongPtrW(window,GWL_STYLE)&WS_VISIBLE)!=0)!=show) ShowWindow(window,show?SW_SHOWNOACTIVATE:SW_HIDE);
  }
  const bool show=visible&&selected;
  if(((GetWindowLongPtrW(surface,GWL_STYLE)&WS_VISIBLE)!=0)!=show) ShowWindow(surface,show?SW_SHOWNOACTIVATE:SW_HIDE);
}
bool allowed(const std::string& value) {
  if(value=="about:blank") return true;
  if(value.rfind("chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/",0)==0) return true;
  if(value.empty() || value.size()>16384) return false;
  auto buffer=wide(value); auto url=text(buffer); cef_urlparts_t parts{}; parts.size=sizeof(parts);
  bool valid=API(cef_parse_url)(&url,&parts)!=0;
  auto scheme=utf8(&parts.scheme), host=utf8(&parts.host), origin=utf8(&parts.origin);
  valid=valid&&(scheme=="http"||scheme=="https")&&!host.empty()&&host!="qqclaw.local"&&!parts.username.length&&!parts.password.length;
  if(valid && config.contains("allowedOrigins")) {
    while(!origin.empty()&&origin.back()=='/') origin.pop_back();
    valid=std::find(config["allowedOrigins"].begin(),config["allowedOrigins"].end(),Json(origin))!=config["allowedOrigins"].end();
  }
  for(auto* part:{&parts.spec,&parts.scheme,&parts.username,&parts.password,&parts.host,&parts.port,&parts.origin,&parts.path,&parts.query}) API(cef_string_utf16_clear)(part);
  return valid;
}
void flushClosingPages();
void cancelDownload(Download& item) {
  // Destroying an uncontinued before callback cancels that download too.
  auto* before=item.before;item.before=nullptr;auto* callback=item.callback;
  if(callback)callback->base.add_ref(&callback->base);
  release(before);
  if(callback){callback->cancel(callback);release(callback);}
}
void cancelDownloads(int tab=0) {
  std::vector<uint32_t> keys;for(auto& [key,item]:downloads)if(!tab||item.tab==tab)keys.push_back(key);
  for(auto key:keys){auto entry=downloads.find(key);if(entry!=downloads.end())cancelDownload(entry->second);}
}
Json downloadState(cef_download_item_t* item, int tab) {
  const bool completed=item->is_complete(item)!=0,cancelled=item->is_canceled(item)!=0,interrupted=item->is_interrupted(item)!=0;
  const auto status=completed?"completed":cancelled?"cancelled":interrupted?"interrupted":"running";
  return {{"owner",owner},{"downloadId",std::to_string(item->get_id(item))},{"tabId",id(tab)},
    {"url",returnedString(item->get_url(item))},{"name",returnedString(item->get_suggested_file_name(item))},
    {"path",returnedString(item->get_full_path(item))},{"received",std::max<int64_t>(0,item->get_received_bytes(item))},
    {"total",std::max<int64_t>(0,item->get_total_bytes(item))},{"status",status},
    {"error",interrupted?"Download interrupted ("+std::to_string(item->get_interrupt_reason(item))+")":""}};
}
int CEF_CALLBACK canDownload(cef_download_handler_t*,cef_browser_t* browser,const cef_string_t* url,const cef_string_t*) {
  bool permitted=false;
  try {const int tab=browser->get_identifier(browser);permitted=!closing&&!closeRequested.count(tab)&&config.contains("downloadRoot")&&pages.count(tab)&&allowed(utf8(url));}catch(...){}
  release(browser);return permitted?1:0;
}
int CEF_CALLBACK beforeDownload(cef_download_handler_t*,cef_browser_t* browser,cef_download_item_t* item,const cef_string_t* suggested,cef_before_download_callback_t* callback) {
  const int tab=browser->get_identifier(browser);
  if(!closing && !closeRequested.count(tab) && config.contains("downloadRoot") && pages.count(tab) && item->is_valid(item) && downloads.size()<100) {
    auto& download=downloads[item->get_id(item)];download.tab=tab;
    auto* previous=download.before;download.before=callback;
    auto data=downloadState(item,tab);data["name"]=utf8(suggested);
    write({{"event","download-start"},{"data",data}});
    release(previous);
  } else {release(callback);}
  release(item);release(browser);return 1;
}
void CEF_CALLBACK downloadUpdated(cef_download_handler_t*,cef_browser_t* browser,cef_download_item_t* item,cef_download_item_callback_t* callback) {
  const int tab=browser->get_identifier(browser);
  if(item->is_valid(item)) {
    const uint32_t key=item->get_id(item);
    auto& download=downloads[key];download.tab=tab;
    if(download.callback)release(download.callback);
    download.callback=callback;callback=nullptr;
    const auto state=downloadState(item,tab);const bool ended=state["status"]!="running";
    if(ended || !download.lastSent || GetTickCount64()-download.lastSent>=250) {
      download.lastSent=GetTickCount64();write({{"event","download-progress"},{"data",state}});
    }
    if(ended){auto* before=download.before;auto* activeCallback=download.callback;downloads.erase(key);release(before);release(activeCallback);flushClosingPages();}
    else if(closing || closeRequested.count(tab) || !pages.count(tab))cancelDownload(download);
  }
  release(callback);release(item);release(browser);
}
void downloadCommand(const Json& request) {
  const auto value=request.value("downloadId","");
  size_t used=0;const auto parsed=std::stoull(value,&used);
  if(used!=value.size()||parsed>UINT32_MAX||std::to_string(parsed)!=value)throw std::runtime_error("Invalid download ID");
  const auto key=uint32_t(parsed);auto entry=downloads.find(key);
  if(entry==downloads.end())throw std::runtime_error("The download has already ended");
  if(request.value("action","")=="downloadCancel") {cancelDownload(entry->second);answer(request,{{"accepted",true}});return;}
  auto* callback=entry->second.before;
  if(!callback)throw std::runtime_error("The download destination has already been handled");
  auto valuePath=wide(request.value("path",""));auto destination=std::filesystem::path(valuePath);
  const auto root=std::filesystem::path(wide(config.at("downloadRoot").get<std::string>())).lexically_normal();
  // The parent creates one new directory per download. Never accept a path
  // outside that root or overwrite an existing destination.
  auto parent=destination.parent_path();
  if(!destination.is_absolute() || _wcsicmp(parent.parent_path().c_str(),root.c_str()) || !std::filesystem::is_directory(parent) || std::filesystem::exists(destination))
    throw std::runtime_error("The download destination is outside the application download directory");
  entry->second.before=nullptr;auto pathText=text(valuePath);callback->cont(callback,&pathText,0);release(callback);
  answer(request,{{"continued",true}});
}
void finishShutdown() {
  if(!closing || !pages.empty()) return;
  for(auto& request:shutdownRequests) answer(request,{{"closed",true},{"remainingTabs",0}});
  shutdownRequests.clear(); API(cef_quit_message_loop)();
}
void flushClosingPages() {
  // CEF stops delivering a download's callbacks once its browser is destroyed.
  // Keep the source browser alive until requested cancellations are terminal.
  const std::vector<int> keys(closeRequested.begin(),closeRequested.end());
  for(int key:keys) {
    auto page=pages.find(key);if(page==pages.end()){closeRequested.erase(key);continue;}
    bool downloading=false;for(auto& [downloadId,item]:downloads)if(item.tab==key){downloading=true;break;}
    if(downloading || !closeSent.insert(key).second)continue;
    auto* host=page->second.browser->get_host(page->second.browser);host->close_browser(host,1);release(host);
  }
  finishShutdown();
}
void closeAll() {
  if(closing) {flushClosingPages(); return;}
  closing=true;
  for(auto& [key,page]:pages){stopFind(page);closeRequested.insert(key);}
  cancelDownloads();
  flushClosingPages();
}
void CEF_CALLBACK created(cef_life_span_handler_t*, cef_browser_t* browser) {
  const int key=browser->get_identifier(browser);
  // C API callback arguments transfer one reference. Store that reference until
  // OnBeforeClose; callbacks may use different wrappers for the same browser.
  pages.emplace(key,Page{browser}); active=key;
  if(closing || pages.size()>12) {auto* host=browser->get_host(browser);host->close_browser(host,1);release(host);}
  layout(); if(!creatingForUi) publish();
  // OnContextInitialized precedes asynchronous browser creation. Reporting
  // ready there allowed the next UI request to see an empty activeTab and
  // accidentally select the manual browser route instead of this engine.
  if(!readySent && !closing) {
    readySent=true;
    write({{"event","ready"},{"pid",GetCurrentProcessId()},{"owner",owner},{"sandboxProvided",true},{"apiVersion",CEF_API_VERSION}});
  }
}
void CEF_CALLBACK closed(cef_life_span_handler_t*, cef_browser_t* browser) {
  int key=browser->get_identifier(browser); auto entry=pages.find(key);
  cancelDownloads(key);
  // Native Chrome/extension tab removal can bypass our close request. Such a
  // destroyed browser has no future download callbacks; report uncertainty
  // explicitly rather than leaving a phantom running/completed record.
  std::vector<uint32_t> orphaned;for(auto& [downloadId,item]:downloads)if(item.tab==key)orphaned.push_back(downloadId);
  for(auto downloadId:orphaned){auto item=downloads.find(downloadId);if(item==downloads.end())continue;
    auto* before=item->second.before;auto* callback=item->second.callback;downloads.erase(item);
    write({{"event","download-progress"},{"data",{{"owner",owner},{"downloadId",std::to_string(downloadId)},{"status","interrupted"},{"received",0},{"total",0},{"path",""},{"error","The source tab closed before a final download result was confirmed"}}}});
    release(before);release(callback);
  }
  closeRequested.erase(key);closeSent.erase(key);
  if(entry!=pages.end()) {stopFind(entry->second,"",false);release(entry->second.browser); pages.erase(entry);}
  if(active==key) active=pages.empty()?0:pages.rbegin()->first;
  release(browser); layout(); publish();
  auto requests=closingRequests.find(key);
  if(requests!=closingRequests.end()) {for(auto& r:requests->second) answer(r,state()); closingRequests.erase(requests);}
  finishShutdown();
}
void CEF_CALLBACK address(cef_display_handler_t*, cef_browser_t* browser, cef_frame_t* frame, const cef_string_t* url) {
  if(frame->is_main(frame)) {auto page=pages.find(browser->get_identifier(browser)); if(page!=pages.end()) {auto next=utf8(url);if(next!=page->second.url){stopFind(page->second);page->second.findOpen=false;}page->second.url=next;} publish();}
  release(frame); release(browser);
}
void CEF_CALLBACK title(cef_display_handler_t*, cef_browser_t* browser, const cef_string_t* value) {
  const int key=browser->get_identifier(browser);auto page=pages.find(key);
  if(page!=pages.end()) {
    page->second.title=utf8(value);if(page->second.title.size()>4096)page->second.title.resize(4096);
    if(page->second.historyLoaded)write({{"event","history"},{"data",{{"owner",owner},{"tabId",id(key)},{"operation","title"},{"url",page->second.url},{"title",page->second.title}}}});
  }
  publish(); release(browser);
}
void CEF_CALLBACK loadEnd(cef_load_handler_t*,cef_browser_t* browser,cef_frame_t* frame,int status) {
  const int key=browser->get_identifier(browser);auto page=pages.find(key);
  if(frame->is_main(frame) && page!=pages.end() && status>=200 && status<400 && status!=204 && status!=205 && allowed(page->second.url)) {
    page->second.historyLoaded=true;
    write({{"event","history"},{"data",{{"owner",owner},{"tabId",id(key)},{"operation","visit"},{"url",page->second.url},{"title",page->second.title}}}});
  }
  release(frame);release(browser);
}
void CEF_CALLBACK loading(cef_load_handler_t*,cef_browser_t* browser,int busy,int back,int forward) {
  auto page=pages.find(browser->get_identifier(browser));
  if(page!=pages.end()) {page->second.loading=busy!=0;page->second.back=back!=0;page->second.forward=forward!=0;}
  publish(); release(browser);
}
void CEF_CALLBACK loadError(cef_load_handler_t*,cef_browser_t* browser,cef_frame_t* frame,cef_errorcode_t code,const cef_string_t* message,const cef_string_t*) {
  if(frame->is_main(frame)&&code!=ERR_ABORTED) {auto page=pages.find(browser->get_identifier(browser));if(page!=pages.end()) page->second.error=utf8(message);publish();}
  release(frame);release(browser);
}
int CEF_CALLBACK beforeBrowse(cef_request_handler_t*,cef_browser_t* browser,cef_frame_t* frame,cef_request_t* request,int,int) {
  auto* raw=request->get_url(request);bool permitted=false;
  try {permitted=allowed(utf8(raw));}catch(...){}
  API(cef_string_userfree_utf16_free)(raw);
  if(permitted && frame->is_main(frame)) {auto page=pages.find(browser->get_identifier(browser));if(page!=pages.end()){stopFind(page->second);page->second.findOpen=false;page->second.historyLoaded=false;}}
  if(!permitted && frame->is_main(frame)) {auto page=pages.find(browser->get_identifier(browser));if(page!=pages.end()) page->second.error="This URL is not available in this browser surface";publish();}
  release(request);release(frame);release(browser);return permitted?0:1;
}
void CEF_CALLBACK gotFocus(cef_focus_handler_t*,cef_browser_t* browser) {active=browser->get_identifier(browser);layout();publish();release(browser);}
std::string shortcut(const cef_key_event_t& event, bool findOpen) {
  if(event.modifiers&(EVENTFLAG_ALT_DOWN|EVENTFLAG_COMMAND_DOWN))return "";
  const bool control=(event.modifiers&EVENTFLAG_CONTROL_DOWN)!=0,shift=(event.modifiers&EVENTFLAG_SHIFT_DOWN)!=0;
  const int key=event.windows_key_code;
  if(control && key=='F' && !shift)return "find-browser";
  if(findOpen && ((control&&key=='G')||(!control&&key==VK_F3)))return shift?"find-browser-previous":"find-browser-next";
  if(findOpen && !control && !shift && key==VK_ESCAPE)return "find-browser-close";
  if(control&&key==VK_TAB)return shift?"panel-previous-tab":"panel-next-tab";
  if(control&&key=='B')return shift?"toggle-panel":"toggle-sidebar";
  if(control&&shift&&key=='T')return "panel-reopen-tab";
  if(!control||shift)return "";
  switch(key) {
    case 'T':return "browser-new-tab";case 'W':return "panel-close-active";
    case 'L':return "browser-focus-address";case 'N':return "new-session";
    case 'K':return "search";case VK_OEM_COMMA:return "settings";
    default:return "";
  }
}
int CEF_CALLBACK preKey(cef_keyboard_handler_t*,cef_browser_t* browser,const cef_key_event_t* event,cef_event_handle_t,int*) {
  int handled=0;const int key=browser->get_identifier(browser);auto page=pages.find(key);
  if(event && event->type==KEYEVENT_RAWKEYDOWN && !closing && visible && active==key && page!=pages.end()) {
    auto* host=browser->get_host(browser);HWND window=host->get_window_handle(host);release(host);HWND focused=GetFocus();
    // Page JavaScript cannot invoke this native callback. Additionally reject
    // delayed/background events and focus belonging to another native window.
    if(window && focused && (focused==window || IsChild(window,focused))) {
      auto command=shortcut(*event,page->second.findOpen);
      if(!command.empty()) {write({{"event","shortcut"},{"data",{{"owner",owner},{"tabId",id(key)},{"command",command}}}});handled=1;}
    }
  }
  release(browser);return handled;
}
cef_client_t* CEF_CALLBACK defaultClient(cef_browser_process_handler_t*) {return owned(client);}
cef_life_span_handler_t* CEF_CALLBACK life(cef_client_t*) {return owned(lifetime);}
cef_display_handler_t* CEF_CALLBACK displays(cef_client_t*) {return owned(display);}
cef_load_handler_t* CEF_CALLBACK loads(cef_client_t*) {return owned(load);}
cef_request_handler_t* CEF_CALLBACK requestHandler(cef_client_t*) {return owned(requests);}
cef_focus_handler_t* CEF_CALLBACK focusHandler(cef_client_t*) {return owned(focus);}
cef_find_handler_t* CEF_CALLBACK findHandler(cef_client_t*) {return owned(finder);}
cef_keyboard_handler_t* CEF_CALLBACK keyboardHandler(cef_client_t*) {return owned(keyboard);}
cef_download_handler_t* CEF_CALLBACK downloadsHandler(cef_client_t*) {return owned(downloadHandlerObject);}
cef_browser_process_handler_t* CEF_CALLBACK browserProcess(cef_app_t*) {return owned(process);}
void createPage(const std::string& value) {
  cef_window_info_t info{};info.size=sizeof(info);info.runtime_style=CEF_RUNTIME_STYLE_CHROME;
  cef_browser_settings_t settings{};settings.size=sizeof(settings);auto buffer=wide(value);auto url=text(buffer);
  if(!API(cef_browser_host_create_browser)(&info,owned(client),&url,&settings,nullptr,nullptr)) throw std::runtime_error("Could not create a browser tab");
}
int createUiPage(const std::string& value, bool select) {
  if(pages.size()>=12)throw std::runtime_error("Close an unused tab first");
  const int previous=active;
  cef_window_info_t info{};info.size=sizeof(info);info.runtime_style=CEF_RUNTIME_STYLE_CHROME;
  cef_browser_settings_t settings{};settings.size=sizeof(settings);auto buffer=wide(value);auto url=text(buffer);
  creatingForUi=true;
  auto* browser=API(cef_browser_host_create_browser_sync)(&info,owned(client),&url,&settings,nullptr,nullptr);
  creatingForUi=false;
  if(!browser)throw std::runtime_error("Could not create a browser tab");
  int key=browser->get_identifier(browser);release(browser);
  if(!select)active=pages.count(previous)?previous:0;
  layout();publish();return key;
}
void CEF_CALLBACK contextReady(cef_browser_process_handler_t*) {
  auto* context=API(cef_request_context_get_global_context)();context->set_chrome_color_scheme(context,CEF_COLOR_VARIANT_LIGHT,0);release(context);
  createPage("about:blank");
}
void CEF_CALLBACK commandLine(cef_app_t*,const cef_string_t* type,cef_command_line_t* command) {
  if(!type||!type->length) {std::wstring name=L"load-extension";auto key=text(name),value=text(extension);command->append_switch_with_value(command,&key,&value);}
  release(command);
}
void execute(const Json& request) {
  try {
    if(!request.is_object() || request.value("owner","")!=owner) throw std::runtime_error("The browser request belongs to another session");
    const auto action=request.value("action","");
    if(action=="shutdown") {shutdownRequests.push_back(request);closeAll();return;}
    if(closing) throw std::runtime_error("The browser session is closing");
    if(action=="state") {answer(request,state());return;}
    if(action=="downloadPath" || action=="downloadCancel") {downloadCommand(request);return;}
    if(action=="view") {
      ++viewUpdates;
      width=std::clamp(request.value("width",1000),1,30000);height=std::clamp(request.value("height",760),1,30000);
      visible=request.value("visible",false);const int x=std::clamp(request.value("x",0),-10000,30000),y=std::clamp(request.value("y",0),-10000,30000);
      SetWindowPos(surface,nullptr,x,y,width,height,SWP_NOZORDER|SWP_NOACTIVATE);layout();answer(request,state());return;
    }
    if(action=="newTab") {createUiPage("about:blank",true);answer(request,state());return;}
    if(action=="restoreTab") {
      auto value=request.value("url","");if(value.empty())value="about:blank";
      if(!allowed(value))throw std::runtime_error("Unsupported browser URL");
      int key=createUiPage(value,false);answer(request,{{"tabId",id(key)},{"state",state()}});return;
    }
    if(action=="open" && pages.empty() && request.value("tabId","").empty()) {
      auto value=request.value("url","");if(!allowed(value))throw std::runtime_error("Unsupported browser URL");
      createUiPage(value,true);answer(request,state());return;
    }
    const int key=browserId(request);auto entry=pages.find(key);if(entry==pages.end())throw std::runtime_error("The browser tab has closed");
    auto* browser=entry->second.browser;
    if(action=="closeTab") {closingRequests[key].push_back(request);closeRequested.insert(key);stopFind(entry->second);cancelDownloads(key);flushClosingPages();return;}
    if(closeRequested.count(key))throw std::runtime_error("The browser tab is closing");
    if(action=="find") {find(entry->second,request);return;}
    if(action=="selectTab" || action=="focus") {active=key;auto* host=browser->get_host(browser);host->set_focus(host,1);release(host);layout();}
    else if(action=="stop") browser->stop_load(browser);
    else if(action=="back") {stopFind(entry->second);entry->second.findOpen=false;entry->second.historyLoaded=false;browser->go_back(browser);}
    else if(action=="forward") {stopFind(entry->second);entry->second.findOpen=false;entry->second.historyLoaded=false;browser->go_forward(browser);}
    else if(action=="reload") {stopFind(entry->second);entry->second.findOpen=false;entry->second.historyLoaded=false;browser->reload(browser);}
    else if(action=="open") {
      auto value=request.value("url","");if(!allowed(value))throw std::runtime_error("Unsupported browser URL");
      stopFind(entry->second);
      entry->second.findOpen=false;entry->second.historyLoaded=false;
      entry->second.error.clear();auto* frame=browser->get_main_frame(browser);if(!frame)throw std::runtime_error("The browser is not ready");
      auto buffer=wide(value);auto url=text(buffer);frame->load_url(frame,&url);release(frame);
    } else throw std::runtime_error("Unsupported browser UI action");
    publish();answer(request,state());
  }catch(const std::exception& error) {answer(request,nullptr,error.what());}
}
void CEF_CALLBACK task(cef_task_t* self) {execute(Object<cef_task_t>::object(&self->base)->data);}
void post(Json request) {auto* work=new Object<cef_task_t>();work->data=std::move(request);work->value.execute=task;API(cef_post_task)(TID_UI,&work->value);}
void readInput() {
  DuplicateHandle(GetCurrentProcess(),GetCurrentThread(),GetCurrentProcess(),&readerHandle,0,false,DUPLICATE_SAME_ACCESS);
  std::string pending;char bytes[4096];DWORD count;
  while(!stopping && ReadFile(input,bytes,sizeof(bytes),&count,nullptr)&&count) {
    pending.append(bytes,count);
    if(pending.size()>1024*1024) break;
    size_t end;
    while((end=pending.find('\n'))!=std::string::npos) {
      auto line=pending.substr(0,end);pending.erase(0,end+1);
      try {auto value=Json::parse(line);if(!value.is_object()||!value.contains("id")||!value["id"].is_number_integer())throw std::runtime_error("Invalid request envelope");post(std::move(value));}
      catch(const std::exception& error) {write({{"event","protocol-error"},{"error",error.what()}});}
    }
  }
  if(!stopping) post({{"owner",owner},{"action","shutdown"}});
}
LRESULT CALLBACK windowProc(HWND window,UINT message,WPARAM w,LPARAM l) {
  if(message==WM_CLOSE) {closeAll();return 0;}
  if(message==WM_TIMER) {
    for(auto& [key,page]:pages) if(page.finding && GetTickCount64()-page.findStarted>=10000)
      stopFind(page,"The page did not confirm the find result within 10 seconds; the browser was kept open");
    layout();return 0;
  }
  return DefWindowProcW(window,message,w,l);
}
} // namespace

extern "C" __declspec(dllexport) int RunWinMain(HINSTANCE instance,LPWSTR,int,void* sandboxInfo,cef_version_info_t* bootstrap) {
  if(!sandboxInfo||!bootstrap) return 20;
  wchar_t file[32768];if(!GetModuleFileNameW(nullptr,file,32768))return 10;
  library=LoadLibraryExW((std::filesystem::path(file).parent_path()/L"libcef.dll").c_str(),nullptr,LOAD_WITH_ALTERED_SEARCH_PATH);if(!library)return 11;
  const char* hash=API(cef_api_hash)(CEF_API_VERSION,0);if(!hash||std::strcmp(hash,CEF_API_HASH_PLATFORM))return 12;
  cef_version_info_t actual{};actual.size=sizeof(actual);API(cef_version_info_all)(&actual);
  if(bootstrap->size<CEF_VERSION_INFO_SIZE_WITH_SANDBOX_HASH||!actual.sandbox_compat_hash[0]||std::strcmp(actual.sandbox_compat_hash,bootstrap->sandbox_compat_hash))return 21;
  app=new Object<cef_app_t>();client=new Object<cef_client_t>();process=new Object<cef_browser_process_handler_t>();
  lifetime=new Object<cef_life_span_handler_t>();display=new Object<cef_display_handler_t>();load=new Object<cef_load_handler_t>();requests=new Object<cef_request_handler_t>();focus=new Object<cef_focus_handler_t>();finder=new Object<cef_find_handler_t>();keyboard=new Object<cef_keyboard_handler_t>();
  app->value.get_browser_process_handler=browserProcess;app->value.on_before_command_line_processing=commandLine;
  process->value.get_default_client=defaultClient;process->value.on_context_initialized=contextReady;
  client->value.get_life_span_handler=life;client->value.get_display_handler=displays;client->value.get_load_handler=loads;client->value.get_request_handler=requestHandler;client->value.get_focus_handler=focusHandler;client->value.get_find_handler=findHandler;
  finder->value.on_find_result=findResult;
  client->value.get_keyboard_handler=keyboardHandler;keyboard->value.on_pre_key_event=preKey;
  downloadHandlerObject=new Object<cef_download_handler_t>();client->value.get_download_handler=downloadsHandler;
  downloadHandlerObject->value.can_download=canDownload;downloadHandlerObject->value.on_before_download=beforeDownload;downloadHandlerObject->value.on_download_updated=downloadUpdated;
  lifetime->value.on_after_created=created;lifetime->value.on_before_close=closed;
  display->value.on_address_change=address;display->value.on_title_change=title;
  load->value.on_loading_state_change=loading;load->value.on_load_end=loadEnd;load->value.on_load_error=loadError;requests->value.on_before_browse=beforeBrowse;focus->value.on_got_focus=gotFocus;
  cef_main_args_t args{};args.instance=instance;int code=API(cef_execute_process)(&args,owned(app),sandboxInfo);if(code>=0)return code;
  input=GetStdHandle(STD_INPUT_HANDLE);output=GetStdHandle(STD_OUTPUT_HANDLE);
  SetHandleInformation(input,HANDLE_FLAG_INHERIT,0);SetHandleInformation(output,HANDLE_FLAG_INHERIT,0);
  try {
    int count=0;auto arguments=CommandLineToArgvW(GetCommandLineW(),&count);
    if(count!=2)return 22;std::ifstream stream{std::filesystem::path(arguments[1])};LocalFree(arguments);stream>>config;
    owner=config.at("owner").get<std::string>();profile=wide(config.at("profilePath").get<std::string>());extension=wide(config.at("extensionPath").get<std::string>());
    if(owner.size()!=36||!std::filesystem::is_directory(profile)||!std::filesystem::is_regular_file(std::filesystem::path(extension)/L"manifest.json"))throw std::runtime_error("Invalid browser configuration");
    HWND parent=reinterpret_cast<HWND>(config.value("parentWindow",uint64_t(0)));DWORD parentPid=0,creator=0;
    HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);
    if(snapshot!=INVALID_HANDLE_VALUE){if(Process32FirstW(snapshot,&entry))do{if(entry.th32ProcessID==GetCurrentProcessId()){creator=entry.th32ParentProcessID;break;}}while(Process32NextW(snapshot,&entry));CloseHandle(snapshot);}
    if(!creator || creator!=config.at("parentProcessId").get<DWORD>())throw std::runtime_error("The browser configuration does not belong to its creator");
    if(parent) {GetWindowThreadProcessId(parent,&parentPid);if(parentPid!=creator)throw std::runtime_error("The browser surface belongs to another process");}
    WNDCLASSW type{};type.hInstance=instance;type.lpfnWndProc=windowProc;type.lpszClassName=L"QQClawCefSurface";RegisterClassW(&type);
    surface=CreateWindowExW(0,type.lpszClassName,L"QQClaw browser",(parent?WS_CHILD:WS_OVERLAPPEDWINDOW)|WS_CLIPCHILDREN|WS_CLIPSIBLINGS,0,0,width,height,parent,nullptr,instance,nullptr);
    if(!surface)throw std::runtime_error("Could not create the browser surface");SetTimer(surface,1,200,nullptr);
    cef_settings_t settings{};settings.size=sizeof(settings);settings.no_sandbox=0;
    auto cache=profile+L"\\Default",log=wide(config.at("logPath").get<std::string>());settings.root_cache_path=text(profile);settings.cache_path=text(cache);settings.log_file=text(log);
    if(!API(cef_initialize)(&args,&settings,owned(app),sandboxInfo))return 23;
    reader=std::thread(readInput);API(cef_run_message_loop)();stopping=true;
    if(readerHandle)CancelSynchronousIo(readerHandle);if(reader.joinable())reader.join();if(readerHandle)CloseHandle(readerHandle);
    for(auto& [key,item]:downloads){release(item.before);release(item.callback);}downloads.clear();
    API(cef_shutdown)();KillTimer(surface,1);DestroyWindow(surface);write({{"event","closed"},{"remainingTabs",pages.size()}});
    release(&app->value);release(&client->value);release(&process->value);release(&lifetime->value);release(&display->value);release(&load->value);release(&requests->value);release(&focus->value);release(&finder->value);release(&keyboard->value);release(&downloadHandlerObject->value);return 0;
  }catch(const std::exception& error) {write({{"event","startup-error"},{"error",error.what()}});return 24;}
}

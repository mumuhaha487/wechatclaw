import { icon } from "./icons.mjs";

export function websiteTarget(value) {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.hostname.replace(/\.+$/, "") !== "qqclaw.local" && url.href.length <= 8192 ? url.href : null;
  } catch { return null; }
}

// Decorate explicit standalone links after Markdown sanitization. Titles come
// from the message, not a remote metadata fetch. Inline citations stay inline.
export function websiteCards(html, document) {
  if (!html.includes("<a ")) return html;
  const root = document.createElement("div"); root.innerHTML = html;
  for (const paragraph of [...root.children].filter(element => element.tagName === "P")) {
    if (paragraph.children.length !== 1 || paragraph.firstElementChild.tagName !== "A" ||
        [...paragraph.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
    const anchor = paragraph.firstElementChild, href = websiteTarget(anchor.getAttribute("href")), title = anchor.textContent.trim();
    if (!href || !title) continue;
    const card = document.createElement("section"); card.className = "website-card";
    const main = document.createElement("button"); main.type = "button"; main.className = "website-main";
    main.dataset.action = "website-preview"; main.dataset.id = href;
    main.setAttribute("aria-label", `${title}，在网页预览中打开`);
    const glyph = document.createElement("span"); glyph.className = "website-glyph"; glyph.setAttribute("aria-hidden", "true"); glyph.innerHTML = icon("globe");
    const text = document.createElement("span"); text.className = "website-text";
    const label = document.createElement("strong"); label.textContent = title; label.title = title;
    const subtitle = document.createElement("small"); subtitle.className = "website-meta"; subtitle.textContent = `网站 · ${new URL(href).host}`;
    text.append(label, subtitle); main.append(glyph, text);
    const menu = document.createElement("button"); menu.type = "button"; menu.className = "website-open";
    menu.dataset.action = "website-menu"; menu.dataset.id = href;
    menu.setAttribute("aria-label", `${title}的打开方式`); menu.setAttribute("aria-haspopup", "menu");
    menu.append(document.createTextNode("打开方式 ")); const arrow = document.createElement("span"); arrow.innerHTML = icon("down"); menu.append(arrow);
    card.append(main, menu); paragraph.replaceWith(card);
  }
  return root.innerHTML;
}

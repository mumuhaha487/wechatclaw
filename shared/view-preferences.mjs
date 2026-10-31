import { sameWorkspace } from "./workspace.mjs";

// Persist layout metadata only; never accept arbitrary browser storage fields.
export function viewPreferences(value, { sessions = [], projects = [] } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  const active = sessions.find(session => session.id === value["active-session"]);
  result["active-session"] = active?.id || "";
  const workspace = active?.workspace || value["active-project"];
  result["active-project"] = typeof workspace === "string" && workspace.length <= 4096 &&
    !workspace.includes("\0") && [...projects, ...sessions].some(item => sameWorkspace(item.workspace, workspace)) ? workspace : "";
  for (const key of ["panel-open", "sidebar-open", "panel-maximized"]) {
    if (["true", "false"].includes(value[key])) result[key] = value[key];
  }
  if (["", "browser", "files", "review"].includes(value["panel-page"])) result["panel-page"] = value["panel-page"];
  for (const [key, minimum, maximum] of [["panel-width", 280, 1200], ["sidebar-width", 220, 520]]) {
    const number = typeof value[key] === "string" && value[key].trim() ? Number(value[key]) : NaN;
    if (Number.isFinite(number)) result[key] = String(Math.round(Math.max(minimum, Math.min(maximum, number))));
  }
  if (typeof value["expanded-projects"] === "string" && value["expanded-projects"].length <= 20000) {
    try {
      const ids = JSON.parse(value["expanded-projects"]);
      if (Array.isArray(ids)) result["expanded-projects"] = JSON.stringify([...new Set(ids.filter(id => projects.some(project => project.id === id)))]);
    } catch {}
  }
  return result;
}

export const VIEW_PREFERENCE_KEYS = ["active-session", "active-project", "panel-open", "sidebar-open", "panel-maximized", "panel-page", "panel-width", "sidebar-width", "expanded-projects"];

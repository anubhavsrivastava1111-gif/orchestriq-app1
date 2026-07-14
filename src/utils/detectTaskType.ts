// ─── detectTaskType ───────────────────────────────────────────────────────────
// Pure function — no React, no side effects. Reads a prompt string and returns
// the task-type string used by the provider router (resolveRoute).
//
// Extracted from App.tsx so it can be:
//   • unit-tested independently
//   • imported by IntelligenceEngine for pipeline classification
//   • reused across Project Engine, Task Queue, and Autopilot
//
// USAGE:
//   import { detectTaskType } from "../utils/detectTaskType";
//   const task = detectTaskType(userMessage, previousContext);

export function detectTaskType(prompt: string, context = ""): string {
  const t = (prompt + " " + context).toLowerCase();

  // Image generation
  if (/(generate\s+(?:an?\s+)?image|create\s+(?:an?\s+)?(?:image|photo|picture)|make\s+(?:an?\s+)?image|draw\s+(?:an?\s+)?image|render\s+(?:an?\s+)?(?:image|photo)|design\s+(?:an?\s+)?logo)/.test(t))
    return "image_gen";

  // Video generation
  if (/(generate\s+(?:an?\s+)?video|create\s+(?:an?\s+)?video|make\s+(?:an?\s+)?video|produce\s+(?:an?\s+)?video|render\s+(?:an?\s+)?video|generate\s+(?:an?\s+)?reel)/.test(t))
    return "video_gen";

  // Excel / financial modelling
  if (/(excel|dashboard|spreadsheet|xlsm|xlsx|workbook|pivot|p&l|profit.*loss|balance.*sheet|cash.*flow|forecast|budget.*model|ebitda|irr|npv|financial.*model|variance.*analysis|mis.*report|revenue.*projection)/.test(t))
    return "excel_advanced";

  // Financial analysis (non-Excel)
  if (/(p&l|profit.*loss|balance.*sheet|cash.*flow|forecast|budget|ebitda|irr|npv|variance.*analysis|mis.*report)/.test(t))
    return "financial";

  // PowerPoint / presentations
  if (/(powerpoint|presentation|deck|slide|pptx|pitch deck|board deck|investor deck|mckinsey|bcg|deloitte)/.test(t))
    return "powerpoint";

  // Audit & compliance
  if (/(audit|sox|itgc|compliance|risk.*register|internal.*control|workpaper|finding|assurance|concur|servicenow)/.test(t))
    return "audit";

  // Vision / image reading
  if (/(photo|ocr|scan.*document|extract.*from.*image|read.*image|visual.*analysis|screenshot|camera)/.test(t))
    return "vision";

  // Code
  if (/(code|function|script|debug|python|javascript|typescript|sql|api.*endpoint|algorithm|unit.*test|refactor)/.test(t))
    return "code";

  // Research
  if (/(research|market.*size|competitor|industry.*analysis|trend|report|analysis|benchmark)/.test(t))
    return "research";

  // Creative writing
  if (/(write|draft|compose|email.*to|linkedin|blog.*post|marketing.*copy|press.*release|creative.*writing)/.test(t))
    return "creative";

  return "general";
}

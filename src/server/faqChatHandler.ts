import type express from 'express';
import fs from 'fs';
import path from 'path';

const TAKA_CORE_SYSTEM_CONTEXT = `
=== TAKA PM CORE SYSTEM ARCHITECTURE & BUSINESS RULES ===
1. 4-KEY COMPOSITE ISOLATION & DUPLICATE GUARD:
   - Every Project, Task, Cost, and Delegation is strictly isolated by 4 keys: projectId + projectCode + year + store (HCM vs HN).
   - Duplicate Project Prevention: Creating two projects with the same Year + Store + Location (Floor) + Project Code (or matching an existing Project Code Link in the same scope) is strictly blocked.
   - Safe Cascade Delete: Deleting a project only deletes that specific projectId and its own tasks/costs, never affecting other projects.

2. GANTT CHART, INLINE EDIT MODE & PREDECESSOR (#) SCHEDULING:
   - Inline Editing on Gantt: Columns 'Duration', 'Start Date', 'Finish Date', 'Party', and 'Predecessor' on the Gantt tab can ONLY be edited when 'Edit Mode' ('ON Task detail' button on Header) is enabled. Changes sync 100% bidirectionally with Task Detail in 0ms.
   - Predecessor Syntax uses '#' (e.g., A01#1FS+2 or #1FS):
     * FS (Finish-to-Start, default), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish).
     * Two-Ended Lock: Entering two predecessors separated by comma (e.g., #1SS, #3FF) locks both Start and Finish and auto-calculates Duration.
   - Flexible (Blue Play icon ▶️) cascades schedule changes automatically; Pinned (Green Pin 📌) freezes task dates.
   - Sticky Month Header & Resize: Drag the divider between any two months left/right to resize month column width.

3. 2D FLOOR LAYOUT, TOOLTIP COMMENTS-FIRST & COLOR LEGEND ATTACHMENTS:
   - Layout Tooltip -> Comments First: Clicking the 'Open Project' button on any unit's Tooltip in the Layout tab opens the Project Modal directly to the 'Comments' tab first so users immediately see the latest site notes/discussions.
   - Color Legend '📎 Attached' Button: Each status row (and TOTAL row) in the Layout Color Legend displays a Paperclip (📎) badge when projects in that status group have attached photos/PDFs. Clicking it opens the unified full-screen Lightbox with 0 extra Firestore reads.
   - Multi-Unit 'Project Code Link': Separating unit codes with commas (e.g., L3-303-1, L3-303-2) paints all linked units and sums their area (sizeM2) in Color Legend without double-counting.

4. BUDGET, 3-INSTALLMENT COST & RBAC MASKING (***):
   - Remaining Budget Formula: Remaining = Budget - Actual/Forc + Supporting Fee.
     * Green (> 20% left), Amber (0% to 20% left), Red (< 0% over-budget).
   - Project Modular (Parent-Child): Parent row expands into '↳ SELF' (own budget) and '↳ SUB' (linked child projects).
   - 3-Installment Payments (Cost Tab): Supports VAT (0%, 8%, 10%), Incl. VAT = Excl. VAT * (1 + VAT%). Entering 1st Paid and 2nd Paid auto-calculates 3rd Paid to equal 100%. Balance = Actual - (1st + 2nd + 3rd Paid).
   - Why Money Editing is Locked or Masked as ***:
     1) Currency is set to JPY or USD (switch back to '000 VND to edit).
     2) Viewing a past fiscal year (auto Read-Only lock).
     3) Account lacks canWrite or financial See permission in RBAC (numbers show as ***).

5. LOCAL-FIRST (DEXIE.JS), ZERO-READ STORM PROTECTION & ZERO-ZOMBIE SYNC:
   - Data loads in 5-10ms from Dexie.js (IndexedDB) + Zustand with 0ms optimistic mutations.
   - Zero-Zombie Task Cleanup (0 Firestore Reads): Deleted tasks broadcast via taka_deltas, are recorded in taskDeletedTracker, and any stale local tasks missing from project.taskSummaries (after a 30s recent-edit guard) are purged locally from Zustand & Dexie without extra network reads.
   - Overnight Wake-up Guard: Waking a device after >60s automatically pulls missed deltas and reconciles state without clearing cache.
`;

let cachedDocs: { manualMd: string; businessMd: string } | null = null;
function loadFaqKnowledgeDocs(): { manualMd: string; businessMd: string } {
  if (cachedDocs) return cachedDocs;
  let manualMd = '';
  let businessMd = '';
  try {
    const manualPath = path.join(process.cwd(), 'USER_MANUAL.md');
    if (fs.existsSync(manualPath)) {
      manualMd = fs.readFileSync(manualPath, 'utf-8');
    }
  } catch {
    manualMd = '';
  }
  try {
    const blPath = path.join(process.cwd(), 'BUSINESS_LOGIC.md');
    if (fs.existsSync(blPath)) {
      businessMd = fs.readFileSync(blPath, 'utf-8');
    }
  } catch {
    businessMd = '';
  }
  cachedDocs = { manualMd, businessMd };
  return cachedDocs;
}

export function registerFaqChatRoute(app: express.Express): void {
  app.post('/api/faq-chat', async (req, res) => {
    try {
      const {
        question,
        lang = 'vi',
        activeTab = 'general',
        intentCategory = 'manual_topic',
        localContext = '',
        liveDataContext = '',
        recentHistory = []
      } = req.body || {};

      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Missing question' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({
          answer: localContext || null,
          source: 'local_knowledge'
        });
      }

      const { manualMd, businessMd } = loadFaqKnowledgeDocs();
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const historyBlock = Array.isArray(recentHistory) && recentHistory.length > 0
        ? recentHistory.map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${String(h.text || '')}`).join('\n')
        : 'None';

      const systemInstruction =
        `You are the intelligent Takashimaya Project Management (Taka PM) AI Assistant & Data Analyst.\n` +
        `The user is currently on tab: "${activeTab}". Detected question intent: "${intentCategory}".\n` +
        `CRITICAL INSTRUCTIONS:\n` +
        `1. Directly and accurately answer the user's exact question in the very first sentence. Do NOT dump unrelated manual topics.\n` +
        `2. If the user asks about a specific project code (e.g., L3-333-2, HN-TKV-BOH), delayed projects, project counts, area (m²), or budget/cost status, use the [LIVE WORKSPACE SNAPSHOT] and [PRE-ANALYZED ANSWER / MATCHED CONTEXT] below to cite exact numbers, dates, progress %, and task names.\n` +
        `3. If the user asks "Why" (Tại sao) or "How to" (Làm sao / Cách), explain the exact root cause and give clear, numbered UI steps using exact Taka PM button/tab names.\n` +
        `4. Format cleanly with Markdown headings (###), bold key terms (**...**), inline code (\`...\`), and 3-6 concise bullet points.\n` +
        `5. Respond in ${lang === 'vi' ? 'natural, professional Vietnamese' : 'clear, professional English'}.\n\n` +
        `${TAKA_CORE_SYSTEM_CONTEXT}\n` +
        `--- LIVE WORKSPACE SNAPSHOT (REAL-TIME IN-MEMORY DATA) ---\n${liveDataContext}\n\n` +
        `--- PRE-ANALYZED ANSWER / MATCHED CONTEXT ---\n${localContext}\n\n` +
        `--- RECENT CONVERSATION HISTORY ---\n${historyBlock}\n\n` +
        `--- REFERENCE: USER_MANUAL.md (EXCERPT) ---\n${manualMd.slice(0, 18000)}\n` +
        `--- REFERENCE: BUSINESS_LOGIC.md (EXCERPT) ---\n${businessMd.slice(0, 18000)}`;

      let responseText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: question,
          config: {
            systemInstruction,
            maxOutputTokens: 1024,
            temperature: 0.15,
            thinkingConfig: { thinkingBudget: 0 }
          }
        });
        responseText = response.text || '';
      } catch {
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: question,
          config: {
            systemInstruction,
            maxOutputTokens: 1024,
            temperature: 0.15
          }
        });
        responseText = fallbackResponse.text || '';
      }

      return res.status(200).json({
        answer: responseText.trim() || localContext || null,
        source: 'gemini_2_5_flash'
      });
    } catch (error: any) {
      return res.status(200).json({
        answer: req.body?.localContext || null,
        source: 'local_fallback',
        error: error?.message || 'AI request failed'
      });
    }
  });
}

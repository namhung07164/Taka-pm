import type express from 'express';
import fs from 'fs';
import path from 'path';

const TAKA_CORE_SYSTEM_CONTEXT = `
=== TAKA PM CORE SYSTEM ARCHITECTURE & MANUAL SUMMARY ===
1. OFFLINE-FIRST / LOCAL-FIRST (DEXIE.JS & iOS 40MB CAP):
   - Primary client storage uses Dexie.js (IndexedDB: TakaLocalDB) + Zustand in-memory store for 0ms optimistic UI updates and 5-10ms cold boot.
   - Mutations queue safely in syncQueue.ts when offline and broadcast incremental deltas via taka_deltas (onSnapshot + serverTime cursor).
   - iOS Safari / WebKit Memory Guard: Firestore IndexedDB cache is strictly capped at 40MB (cacheSizeBytes: 41943040) with persistentSingleTabManager({ forceOwnership: true }) in PWA/iframe to prevent WebKit from wiping IndexedDB and causing read storms.
   - 4-Key Composite Isolation: Every entity (Project, Task, Cost, Delegation) is strictly isolated by 4 keys: projectId + projectCode + year + store (HCM vs HN).

2. GANTT CHART & PREDECESSOR (#) SCHEDULING:
   - Tasks are numbered in WBS hierarchy (#1, #2...). Parent task dates and progress (%) roll up 100% in client memory.
   - Predecessor syntax uses '#' (e.g., A01#1FS+2 or #1FS):
     * FS (Finish-to-Start, default), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish).
     * Two-ended lock: Entering two predecessors (e.g., A01#1SS, A01#3FF) locks both Start and Finish and auto-computes Duration.
   - Flexible (Blue Play icon) cascades schedule changes automatically; Pinned (Green Pin) freezes task dates.
   - Gantt Timeline Header: Month row stays sticky at top when scrolling vertically. Grab and drag the divider between any 2 months left/right to lengthen or shorten month width (wheel zoom on month row is disabled).

3. BUDGET & 3-INSTALLMENT COST MANAGEMENT:
   - Remaining Budget Formula: Remaining = Budget - Actual/Forc + Supporting Fee.
   - Color Warnings by Remaining %: Green (> 20% safe), Amber/Yellow (0% to 20% tight), Red (< 0% over-budget).
   - Project Modular (Parent-Child): Parent row expands into '↳ SELF' (own budget) and '↳ SUB' (linked child projects).
   - 3-Installment Payments (Cost Tab): Supports VAT (0%, 8%, 10%), Amount Incl. VAT = Excl. VAT * (1 + VAT%). Entering 1st Paid (Advance) and 2nd Paid (Progress) auto-calculates 3rd Paid (Final Settlement) to equal 100%. Balance = Actual - (1st + 2nd + 3rd Paid).

4. iOS CALENDAR SYNC (WEBCAL / QR CODE):
   - Users click 'Sync iOS / QR' in Calendar Tab or Header to generate a live webcal:// link and QR Code.
   - Scanning the QR Code on iPhone/iPad subscribes Apple Calendar to live project & task milestones.

5. CLOUDFLARE R2, CORS POLICY & SLEEPING TABS:
   - R2 CORS Policy requires AllowedOrigins: ["*"], AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"], AllowedHeaders: ["*"].
   - Chrome/Edge Sleeping Tabs: Whitelist Taka PM in chrome://settings/performance or edge://settings/system. Overnight Wake-up Guard auto-detects sleep gaps (>60s), pulls missed deltas, and cleans zombie tasks without clearing cache.
`;

function loadFaqKnowledgeDocs(): { manualMd: string; businessMd: string } {
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
  return { manualMd, businessMd };
}

export function registerFaqChatRoute(app: express.Express): void {
  app.post('/api/faq-chat', async (req, res) => {
    try {
      const { question, lang = 'vi', activeTab = 'general', localContext = '' } = req.body || {};
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

      const systemInstruction =
        `You are the official Takashimaya Project Management (Taka PM) User Manual Assistant.\n` +
        `The user is currently on tab: "${activeTab}".\n` +
        `CRITICAL CONSTRAINTS:\n` +
        `- Keep your answer ultra-concise, clear, and complete within 3 to 5 bullet points (under 220 words) so it fits cleanly within maxOutputTokens: 300.\n` +
        `- Respond in ${lang === 'vi' ? 'Vietnamese' : 'English'}.\n` +
        `- Base your answer strictly on the Taka PM Core System Context and documentation below.\n` +
        `${TAKA_CORE_SYSTEM_CONTEXT}\n` +
        `--- MATCHED FAQ CONTEXT ---\n${localContext}\n` +
        `--- USER_MANUAL.md EXCERPT ---\n${manualMd.slice(0, 8000)}\n` +
        `--- BUSINESS_LOGIC.md EXCERPT ---\n${businessMd.slice(0, 5000)}`;

      let responseText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: question,
          config: {
            systemInstruction,
            maxOutputTokens: 300,
            temperature: 0.2
          }
        });
        responseText = response.text || '';
      } catch {
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: question,
          config: {
            systemInstruction,
            maxOutputTokens: 300,
            temperature: 0.2
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

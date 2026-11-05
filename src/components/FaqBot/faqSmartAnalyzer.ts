import { useAppStore } from '../../store/useAppStore';
import { Project, Task, Cost, TabId, AppRole } from '../../types';
import { FAQ_KNOWLEDGE_BASE, FaqKnowledgeEntry, searchFaqKnowledge } from './faqKnowledgeEngine';
import { FAQ_TARGETED_QA_BANK } from './faqTargetedQaBank';

export interface SmartAnalysisResult {
  intentCategory: 'project_lookup' | 'portfolio_analytics' | 'targeted_qa' | 'manual_topic';
  isLiveDataQuery: boolean;
  formattedAnswer: string;
  liveWorkspaceDigest: string;
  primaryEntry?: FaqKnowledgeEntry;
  relatedEntries: FaqKnowledgeEntry[];
  targetTab?: TabId;
  targetTabLabelVi?: string;
  targetTabLabelEn?: string;
  followUpPrompts: string[];
}

function norm(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9#%+*\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canUserSeeFinancials(): boolean {
  const { currentUser, permissionMatrix } = useAppStore.getState();
  if (!currentUser) return false;
  if (!currentUser.canSee) return false;
  const r = String(currentUser.role || '').toLowerCase();
  if (r === 'admin' || r === 'manager') return true;
  const roleKey = (['Manager', 'Staff', 'CP', 'External'].find(
    k => k.toLowerCase() === r
  ) || 'Staff') as AppRole;
  const seeBudget = permissionMatrix?.[roleKey]?.See?.budget;
  const seeCost = permissionMatrix?.[roleKey]?.See?.costDetail;
  return seeBudget !== false || seeCost !== false;
}

function getAccessibleProjects(): Project[] {
  const { projects, currentUser } = useAppStore.getState();
  const active = (projects || []).filter(p => !p.isDeleted);
  if (!currentUser) return active;
  const isAdmin = String(currentUser.role || '').toLowerCase() === 'admin' || currentUser.role === 'Manager';
  if (isAdmin) return active;

  return active.filter(p => {
    const storeNorm = String(p.store || '').toLowerCase().trim();
    if (currentUser.storePermissions) {
      if (storeNorm === 'hcm' && currentUser.storePermissions.hcm === false) return false;
      if (storeNorm === 'hn' && currentUser.storePermissions.hn === false) return false;
    }
    if (currentUser.locationPermissions && !currentUser.locationPermissions.all) {
      const loc = String(p.location || '').trim();
      if (loc && currentUser.locationPermissions[loc] === false) return false;
    }
    return true;
  });
}

function getTasksForProject(project: Project, allTasks: Task[]): Array<{
  name: string;
  start: string;
  finish: string;
  runningStatus: string;
  party: string;
  predecessor: string;
}> {
  const pId = String(project.id || '').trim();
  const pCode = String(project.code || '').toLowerCase().trim();
  const pStore = String(project.store || '').toLowerCase().trim();
  const pYear = String(project.year || '').trim();

  const matched = allTasks.filter(t => {
    if (t.isDeleted) return false;
    const tPid = String(t.projectId || '').trim();
    if (pId && tPid) return pId === tPid;
    if (pId && !tPid) {
      return (
        String(t.projectCode || '').toLowerCase().trim() === pCode &&
        String(t.projectStore || '').toLowerCase().trim() === pStore &&
        String(t.projectYear || '').trim() === pYear
      );
    }
    return false;
  });

  if (matched.length > 0) {
    return matched.map(t => ({
      name: t.name,
      start: t.start || '-',
      finish: t.finish || '-',
      runningStatus: t.runningStatus || 'Upcoming',
      party: t.party || '-',
      predecessor: t.predecessor || ''
    }));
  }

  return (project.taskSummaries || []).map(ts => ({
    name: ts.name,
    start: ts.start || '-',
    finish: ts.finish || '-',
    runningStatus: String(ts.runningStatus || 'Upcoming'),
    party: String(ts.party || '-'),
    predecessor: String(ts.predecessor || '')
  }));
}

function computeProjectCostActual(project: Project, allCosts: Cost[]): number {
  const pId = String(project.id || '').trim();
  const pCode = String(project.code || '').toLowerCase().trim();
  const pStore = String(project.store || '').toLowerCase().trim();
  const pYear = String(project.year || '').trim();

  const matchedCosts = allCosts.filter(c => {
    if (c.isDeleted) return false;
    const cPid = String(c.projectId || '').trim();
    if (pId && cPid) return pId === cPid;
    return (
      String(c.projectCode || '').toLowerCase().trim() === pCode &&
      String(c.projectStore || '').toLowerCase().trim() === pStore &&
      String(c.projectYear || '').trim() === pYear
    );
  });

  if (matchedCosts.length > 0) {
    return matchedCosts.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
  }
  return Number(project.actual) || 0;
}

function fmtMoney(val: number, canSeeMoney: boolean): string {
  if (!canSeeMoney) return '***';
  return `${Math.round(val).toLocaleString('en-US')} ('000 VND)`;
}

function getEffectiveStatus(p: Project): string {
  return String(p.computedActStatus || p.computedStatus || 'Upcoming');
}

function buildProjectDiagnosticAnswer(
  matchedProjects: Project[],
  lang: 'vi' | 'en',
  canSeeMoney: boolean
): SmartAnalysisResult {
  const { tasks, costs } = useAppStore.getState();
  const activeTasks = (tasks || []).filter(t => !t.isDeleted);
  const activeCosts = (costs || []).filter(c => !c.isDeleted);

  const blocks = matchedProjects.slice(0, 3).map(p => {
    const pTasks = getTasksForProject(p, activeTasks);
    const totalTasks = pTasks.length;
    const completedTasks = pTasks.filter(t => t.runningStatus === 'Completed').length;
    const delayedTasks = pTasks.filter(t => t.runningStatus === 'Delayed');
    const onProcessTasks = pTasks.filter(t => t.runningStatus === 'On process');

    const status = getEffectiveStatus(p);
    const planProg = Math.round(Number(p.computedPlanProgress) || 0);
    const actProg = Math.round(Number(p.computedActProgress) || 0);

    const budget = Number(p.budget) || 0;
    const suppFee = Number(p.supportingFee) || 0;
    const actualSpend = computeProjectCostActual(p, activeCosts);
    const remaining = budget - actualSpend + suppFee;
    const remPct = budget > 0 ? Math.round((remaining / budget) * 100) : 0;
    const budgetBadge = !canSeeMoney
      ? '🔒 Masked (`***`)'
      : remaining < 0
      ? `🔴 Over Budget (${fmtMoney(remaining, true)})`
      : remPct <= 20
      ? `🟡 Tight (${remPct}% left · ${fmtMoney(remaining, true)})`
      : `🟢 Healthy (${remPct}% left · ${fmtMoney(remaining, true)})`;

    const startStr = p.computedTakStart || p.start || '-';
    const handoverStr = p.computedTakCompl || p.handover || '-';
    const openingStr = p.computedOpening || p.opening || '-';
    const commentCount = p.comments?.length || 0;
    const latestComment = commentCount > 0 ? p.comments![commentCount - 1] : null;

    if (lang === 'vi') {
      let text =
        `### 📊 Phân tích Dự án \`${p.code}\` — ${p.name}\n` +
        `• **Định danh 4 Khóa**: Năm \`${p.year}\` · Chi nhánh \`${p.store}\` · Tầng \`${p.location || '-'}\` · Diện tích: **\`${p.sizeM2 || 0} m²\`**${p.linkCodes ? ` · Ô ghép (\`Link\`): \`${p.linkCodes}\`` : ''}\n` +
        `• **Trạng thái & Tiến độ**: **\`${status}\`** — Kế hoạch (\`Plan\`): **\`${planProg}%\`** | Thực tế (\`Actual\`): **\`${actProg}%\`**${p.party ? ` · Phụ trách: \`${p.party}\`` : ''}\n` +
        `• **3 Mốc Thời gian**: Start: \`${startStr}\` ➔ Handover: \`${handoverStr}\` ➔ Opening: \`${openingStr}\`\n` +
        `• **Công việc WBS (\`${totalTasks}\` tasks)**: Hoàn thành \`${completedTasks}/${totalTasks}\` · Đang chạy \`${onProcessTasks.length}\` · Trễ hạn (\`Delayed\`): **\`${delayedTasks.length}\`**\n` +
        `• **Ngân sách (\`Budget\`)**: Ngân sách \`${fmtMoney(budget, canSeeMoney)}\` | Đã chi \`${fmtMoney(actualSpend, canSeeMoney)}\` ➔ Còn lại: **${budgetBadge}**`;

      if (delayedTasks.length > 0) {
        const delayList = delayedTasks
          .slice(0, 3)
          .map(t => `\`${t.name}\` (Hạn: ${t.finish}${t.party && t.party !== '-' ? `, PIC: ${t.party}` : ''})`)
          .join('; ');
        text += `\n• ⚠️ **Cảnh báo Task đang trễ**: ${delayList}`;
      }
      if (latestComment) {
        text += `\n• 💬 **Bình luận mới nhất (${commentCount})**: *"${latestComment.text.slice(0, 90)}"* (${latestComment.userName || 'User'})`;
      }
      return text;
    } else {
      let text =
        `### 📊 Live Project Analysis: \`${p.code}\` — ${p.name}\n` +
        `• **4-Key Identity**: Year \`${p.year}\` · Store \`${p.store}\` · Floor \`${p.location || '-'}\` · Area: **\`${p.sizeM2 || 0} m²\`**${p.linkCodes ? ` · Linked Units: \`${p.linkCodes}\`` : ''}\n` +
        `• **Status & Progress**: **\`${status}\`** — Plan: **\`${planProg}%\`** | Actual: **\`${actProg}%\`**${p.party ? ` · Party: \`${p.party}\`` : ''}\n` +
        `• **Key Milestones**: Start: \`${startStr}\` ➔ Handover: \`${handoverStr}\` ➔ Opening: \`${openingStr}\`\n` +
        `• **WBS Tasks (\`${totalTasks}\`)**: Completed \`${completedTasks}/${totalTasks}\` · On Process \`${onProcessTasks.length}\` · Delayed: **\`${delayedTasks.length}\`**\n` +
        `• **Financials**: Budget \`${fmtMoney(budget, canSeeMoney)}\` | Actual/Forc \`${fmtMoney(actualSpend, canSeeMoney)}\` ➔ Remaining: **${budgetBadge}**`;

      if (delayedTasks.length > 0) {
        const delayList = delayedTasks
          .slice(0, 3)
          .map(t => `\`${t.name}\` (Due: ${t.finish})`)
          .join('; ');
        text += `\n• ⚠️ **Delayed Tasks**: ${delayList}`;
      }
      if (latestComment) {
        text += `\n• 💬 **Latest Comment (${commentCount})**: *"${latestComment.text.slice(0, 90)}"*`;
      }
      return text;
    }
  });

  const first = matchedProjects[0];
  return {
    intentCategory: 'project_lookup',
    isLiveDataQuery: true,
    formattedAnswer: blocks.join('\n\n---\n\n'),
    liveWorkspaceDigest: blocks.join('\n'),
    primaryEntry: FAQ_KNOWLEDGE_BASE[1],
    relatedEntries: [FAQ_KNOWLEDGE_BASE[1], FAQ_KNOWLEDGE_BASE[2]],
    targetTab: 'detail',
    targetTabLabelVi: `Xem Task của ${first.code} trên Detail`,
    targetTabLabelEn: `View ${first.code} Tasks on Detail`,
    followUpPrompts:
      lang === 'vi'
        ? ['Dự án nào đang bị trễ tiến độ hiện nay?', 'Tình hình ngân sách các dự án thế nào?']
        : ['Which projects are currently delayed?', 'How is the overall project budget status?']
  };
}

export function analyzeAndAnswerUserQuestion(
  rawQuery: string,
  lang: 'vi' | 'en' = 'vi'
): SmartAnalysisResult {
  const cleanQuery = rawQuery.trim();
  const nq = norm(cleanQuery);
  const state = useAppStore.getState();
  const canSeeMoney = canUserSeeFinancials();
  const accessibleProjects = getAccessibleProjects();

  // Detect explicit Year / Store in query or fallback to global filters
  const yearMatch = cleanQuery.match(/\b(202[4-9]|2030)\b/);
  const targetYear = yearMatch ? yearMatch[1] : state.globalYearFilter || '';
  const hasExplicitHcm = /\b(hcm|sai gon|tp\s*hcm)\b/i.test(nq);
  const hasExplicitHn = /\b(hn|ha noi|hanoi)\b/i.test(nq);
  const targetStore = hasExplicitHcm
    ? 'HCM'
    : hasExplicitHn
    ? 'HN'
    : state.globalStoreFilter && state.globalStoreFilter !== 'All'
    ? state.globalStoreFilter
    : '';

  const scopedProjects = accessibleProjects.filter(p => {
    if (targetYear && targetYear !== 'All' && String(p.year).trim() !== String(targetYear).trim()) {
      return false;
    }
    if (targetStore && String(p.store || '').toUpperCase().trim() !== targetStore.toUpperCase()) {
      return false;
    }
    return true;
  });

  const workingProjects = scopedProjects.length > 0 ? scopedProjects : accessibleProjects;

  // 1. Check if the user mentions a SPECIFIC PROJECT CODE or NAME
  const queryUpper = cleanQuery.toUpperCase();
  const matchedByCodeOrName = workingProjects.filter(p => {
    const code = String(p.code || '').trim().toUpperCase();
    if (code.length >= 2 && queryUpper.includes(code)) {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`, 'i').test(queryUpper)) {
        return true;
      }
    }
    if (p.linkCodes) {
      const links = p.linkCodes.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length >= 3);
      if (links.some(lk => queryUpper.includes(lk))) return true;
    }
    const pNameNorm = norm(p.name || '');
    if (pNameNorm.length >= 5 && nq.includes(pNameNorm)) return true;
    return false;
  });

  if (matchedByCodeOrName.length > 0) {
    return buildProjectDiagnosticAnswer(matchedByCodeOrName, lang, canSeeMoney);
  }

  // Build compact Live Workspace Digest for AI & Portfolio queries
  const delayedProjects = workingProjects.filter(p => /delay/i.test(getEffectiveStatus(p)));
  const inProgressProjects = workingProjects.filter(p => /on process|in progress/i.test(getEffectiveStatus(p)));
  const completedProjects = workingProjects.filter(p => /completed/i.test(getEffectiveStatus(p)));
  const upcomingProjects = workingProjects.filter(p => /upcoming/i.test(getEffectiveStatus(p)));
  const totalAreaM2 = Math.round(workingProjects.reduce((s, p) => s + (Number(p.sizeM2) || 0), 0) * 100) / 100;

  const activeCosts = (state.costs || []).filter(c => !c.isDeleted);
  let totalBudget = 0;
  let totalActual = 0;
  const overBudgetProjects: Array<{ p: Project; diff: number }> = [];

  for (const p of workingProjects) {
    const b = Number(p.budget) || 0;
    const sf = Number(p.supportingFee) || 0;
    const act = computeProjectCostActual(p, activeCosts);
    totalBudget += b;
    totalActual += act;
    const rem = b - act + sf;
    if (b > 0 && rem < 0) {
      overBudgetProjects.push({ p, diff: rem });
    }
  }

  const scopeLabel = `${targetStore || 'All Stores'} · ${targetYear || 'All Years'}`;
  const liveWorkspaceDigest =
    `[LIVE WORKSPACE SNAPSHOT (${scopeLabel})]\n` +
    `- Active Tab: ${state.activeTab} | Edit Mode: ${state.isDetailEditMode ? 'ON' : 'OFF'} | Currency: ${state.currency}\n` +
    `- Total Projects in Scope: ${workingProjects.length} (Completed: ${completedProjects.length}, On Process: ${inProgressProjects.length}, Delayed: ${delayedProjects.length}, Upcoming: ${upcomingProjects.length}) | Total Area: ${totalAreaM2} m²\n` +
    `- Delayed Projects (${delayedProjects.length}): ${delayedProjects.slice(0, 6).map(p => `${p.code} (${p.name}, Store:${p.store}, Floor:${p.location}, Plan:${Math.round(p.computedPlanProgress || 0)}%, Act:${Math.round(p.computedActProgress || 0)}%)`).join('; ') || 'None'}\n` +
    `- Financials: Total Budget=${fmtMoney(totalBudget, canSeeMoney)}, Total Spend=${fmtMoney(totalActual, canSeeMoney)}, Over-Budget Projects=${overBudgetProjects.length} (${overBudgetProjects.slice(0, 4).map(x => `${x.p.code}: ${fmtMoney(x.diff, canSeeMoney)}`).join(', ') || 'None'})\n` +
    `- Top Projects in Scope: ${workingProjects.slice(0, 12).map(p => `[${p.year}/${p.store}/${p.location}] ${p.code} "${p.name}" (${getEffectiveStatus(p)}, ${p.sizeM2 || 0}m²)`).join(' | ')}`;

  // 2. Check if the user is asking a LIVE PORTFOLIO / ANALYTICS question
  const isAskingHowTo = /\b(lam sao|cach|huong dan|how to|how do i|cong thuc|formula)\b/.test(nq);
  const isAskingDelayedList =
    !isAskingHowTo &&
    /\b(du an nao|co bao nhieu|danh sach|liet ke|kiem tra|which project|how many|list|show)\b/.test(nq) &&
    /\b(tre|delay|delayed|qua han|overdue|rui ro|risk|cham tien do)\b/.test(nq);

  if (isAskingDelayedList) {
    const answer =
      lang === 'vi'
        ? `### 🚨 Phân tích Dự án Trễ tiến độ (\`Delayed\`) — Phạm vi: \`${scopeLabel}\`\n` +
          `• Trong tổng số **\`${workingProjects.length}\` dự án**, hiện có **\`${delayedProjects.length}\` dự án đang báo trễ (\`Delayed\`)**.\n` +
          (delayedProjects.length > 0
            ? delayedProjects.slice(0, 8).map((p, i) => `  ${i + 1}. **\`${p.code}\` — ${p.name}** (\`${p.store} · ${p.location || '-'}\`): Kế hoạch \`${Math.round(p.computedPlanProgress || 0)}%\` vs Thực tế **\`${Math.round(p.computedActProgress || 0)}%\`** · Handover: \`${p.computedTakCompl || p.handover || '-'}\``).join('\n') +
              `\n💡 *Mẹo*: Gõ trực tiếp mã dự án (VD: \`Phân tích ${delayedProjects[0].code}\`) để xem chi tiết từng Task nào đang làm trễ dự án đó!`
            : `🎉 Tuyệt vời! Không có dự án nào bị trễ tiến độ trong phạm vi \`${scopeLabel}\`.`)
        : `### 🚨 Delayed Projects Analysis — Scope: \`${scopeLabel}\`\n` +
          `• Out of **\`${workingProjects.length}\` projects**, **\`${delayedProjects.length}\` are currently \`Delayed\`**.\n` +
          (delayedProjects.length > 0
            ? delayedProjects.slice(0, 8).map((p, i) => `  ${i + 1}. **\`${p.code}\` — ${p.name}** (\`${p.store} · ${p.location || '-'}\`): Plan \`${Math.round(p.computedPlanProgress || 0)}%\` vs Actual **\`${Math.round(p.computedActProgress || 0)}%\`**`).join('\n')
            : `🎉 All projects in \`${scopeLabel}\` are on track!`);

    return {
      intentCategory: 'portfolio_analytics',
      isLiveDataQuery: true,
      formattedAnswer: answer,
      liveWorkspaceDigest,
      primaryEntry: FAQ_KNOWLEDGE_BASE[1],
      relatedEntries: [FAQ_KNOWLEDGE_BASE[1], FAQ_KNOWLEDGE_BASE[2]],
      targetTab: 'general',
      targetTabLabelVi: 'Mở Tab General xem Dự án',
      targetTabLabelEn: 'Open General Tab',
      followUpPrompts: delayedProjects.length > 0
        ? [lang === 'vi' ? `Phân tích chi tiết dự án ${delayedProjects[0].code}` : `Analyze project ${delayedProjects[0].code}`, lang === 'vi' ? 'Tại sao dự án bị báo Delayed?' : 'Why is a project marked Delayed?']
        : [lang === 'vi' ? 'Tổng hợp tình hình các dự án hiện tại?' : 'Summary of current projects?']
    };
  }

  const isAskingPortfolioSummary = !isAskingHowTo && /\b(tong hop|thong ke|tinh hinh|bao nhieu du an|danh sach du an|summary|overview|how many projects|status of projects)\b/.test(nq);

  if (isAskingPortfolioSummary) {
    const answer =
      lang === 'vi'
        ? `### 📈 Tổng hợp Nhanh Dữ liệu Dự án — Phạm vi: \`${scopeLabel}\`\n` +
          `• **Tổng số dự án**: **\`${workingProjects.length}\` dự án** (Tổng diện tích: **\`${totalAreaM2} m²\`**)\n` +
          `  - 🟢 **Hoàn thành (\`Completed\`)**: \`${completedProjects.length}\` dự án | 🔵 **Đang thi công (\`On process\`)**: \`${inProgressProjects.length}\` dự án | 🔴 **Trễ tiến độ (\`Delayed\`)**: \`${delayedProjects.length}\` dự án | ⚫ **Sắp triển khai (\`Upcoming\`)**: \`${upcomingProjects.length}\` dự án\n` +
          `• **Tài chính & Ngân sách**:\n` +
          `  - Tổng Ngân sách (\`Budget\`): **\`${fmtMoney(totalBudget, canSeeMoney)}\`** | Đã chi (\`Actual/Forc\`): **\`${fmtMoney(totalActual, canSeeMoney)}\`** | Số dự án vượt ngân sách: **\`${overBudgetProjects.length}\` dự án**\n` +
          `💡 *Bạn có thể gõ mã bất kỳ dự án nào (VD: \`${workingProjects[0]?.code || 'A01'}\`) để tôi phân tích sâu từng Task và chi phí của dự án đó!*`
        : `### 📈 Live Portfolio Summary — Scope: \`${scopeLabel}\`\n` +
          `• **Total Projects**: **\`${workingProjects.length}\`** (Total Area: **\`${totalAreaM2} m²\`**)\n` +
          `  - 🟢 **Completed**: \`${completedProjects.length}\` | 🔵 **On process**: \`${inProgressProjects.length}\` | 🔴 **Delayed**: \`${delayedProjects.length}\` | ⚫ **Upcoming**: \`${upcomingProjects.length}\`\n` +
          `• **Financial Overview**:\n` +
          `  - Total Budget: **\`${fmtMoney(totalBudget, canSeeMoney)}\`** | Actual/Forc Spend: **\`${fmtMoney(totalActual, canSeeMoney)}\`** | Over-budget Projects: **\`${overBudgetProjects.length}\`**`;

    return {
      intentCategory: 'portfolio_analytics',
      isLiveDataQuery: true,
      formattedAnswer: answer,
      liveWorkspaceDigest,
      primaryEntry: FAQ_KNOWLEDGE_BASE[0],
      relatedEntries: [FAQ_KNOWLEDGE_BASE[1], FAQ_KNOWLEDGE_BASE[4]],
      targetTab: 'summary',
      targetTabLabelVi: 'Mở Tab Summary (Báo cáo)',
      targetTabLabelEn: 'Open Summary Tab',
      followUpPrompts: lang === 'vi'
        ? ['Dự án nào đang bị trễ tiến độ hiện nay?', 'Công thức tính Remaining trong Budget là gì?']
        : ['Which projects are currently delayed?', 'What is the Remaining Budget formula?']
    };
  }

  // 3. Score against Targeted Micro-Q&A Bank (High-Precision Intent Matching)
  const isWhyQuestion = /\b(tai sao|vi sao|sao khong|loi|bi khoa|khong duoc|why|cannot|can t|locked)\b/.test(nq);
  const isHowQuestion = /\b(lam sao|cach|nhu the nao|huong dan|how to|how do)\b/.test(nq);
  const tokens = nq.split(' ').filter(t => t.length >= 2);

  let bestQa = FAQ_TARGETED_QA_BANK[0];
  let bestQaScore = 0;

  for (const item of FAQ_TARGETED_QA_BANK) {
    let score = 0;
    if (item.mustHaveAny && !item.mustHaveAny.some(req => nq.includes(norm(req)))) continue;
    const phrases = item.phrasesVi.concat(item.phrasesEn).map(norm);
    for (const ph of phrases) {
      if (nq.includes(ph)) score += 45;
      else {
        const phWords = ph.split(' ').filter(w => w.length >= 2);
        const matchedWords = phWords.filter(w => nq.includes(w)).length;
        if (phWords.length >= 2 && matchedWords >= Math.ceil(phWords.length * 0.75)) score += 26;
      }
    }
    for (const kw of item.keywords.map(norm)) {
      if (nq.includes(kw)) score += 14;
      else if (tokens.some(tk => tk === kw)) score += 8;
    }
    if (isWhyQuestion && (item.intentType === 'why' || item.intentType === 'troubleshoot')) score += 10;
    if (isHowQuestion && (item.intentType === 'how' || item.intentType === 'feature')) score += 8;
    if (item.targetTab === state.activeTab) score += 6;
    if (score > bestQaScore) {
      bestQaScore = score;
      bestQa = item;
    }
  }

  if (bestQaScore >= 28) {
    const title = lang === 'vi' ? bestQa.titleVi : bestQa.titleEn;
    const body = lang === 'vi' ? bestQa.answerVi : bestQa.answerEn;
    const relatedManual = searchFaqKnowledge(cleanQuery, lang).bestMatches;
    return {
      intentCategory: 'targeted_qa',
      isLiveDataQuery: false,
      formattedAnswer: `### ${title}\n${body}`,
      liveWorkspaceDigest,
      primaryEntry: relatedManual[0],
      relatedEntries: relatedManual,
      targetTab: bestQa.targetTab,
      targetTabLabelVi: bestQa.targetTabLabelVi,
      targetTabLabelEn: bestQa.targetTabLabelEn,
      followUpPrompts: lang === 'vi' ? bestQa.followUpsVi : bestQa.followUpsEn
    };
  }

  // 4. Fallback to Knowledge Base with Smart Single-Topic Focus
  const manualSearch = searchFaqKnowledge(cleanQuery, lang, state.activeTab);
  const topEntry = manualSearch.bestMatches[0];
  return {
    intentCategory: 'manual_topic',
    isLiveDataQuery: false,
    formattedAnswer: manualSearch.formattedAnswer,
    liveWorkspaceDigest,
    primaryEntry: topEntry,
    relatedEntries: manualSearch.bestMatches,
    targetTab: topEntry?.targetTab,
    targetTabLabelVi: topEntry?.targetTabLabelVi,
    targetTabLabelEn: topEntry?.targetTabLabelEn,
    followUpPrompts: (lang === 'vi' ? topEntry?.quickPromptsVi : topEntry?.quickPromptsEn) || []
  };
}

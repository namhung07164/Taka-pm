import React, { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "./storage";

export type Language = 'en' | 'ja';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const jaDictionary: Record<string, string> = { 
  'Menu': 'メニュー', 
  'Download PDF': 'PDFダウンロード', 
  'Taka PM System Documentation': 'Taka PMシステムドキュメント', 
  'User Manual': 'ユーザーマニュアル', 
  'Manual': 'マニュアル', 
  'Help': 'ヘルプ', 
  'Dashboard': 'ダッシュボード', 
  'Add Group': 'グループ追加', 
  'Add User': 'ユーザー追加', 
  'Search groups...': 'グループ検索...', 
  'Search users...': 'ユーザー検索...', 
  'Permissions': '権限', 
  'Role/Group': '役割/グループ', 
  'Email': 'メール', 
  'None': 'なし', 
  'Pending': '保留中', 
  'Rejected': '却下', 
  'Approved': '承認済み', 
  'On Process': '進行中', 
  'Order': '順序', 
  'No.': 'No.', 
  'Group': 'グループ', 
  'Role': '役割', 
  'Amount': '金額', 
  'Cost Total': 'コスト合計', 
  'Approval': '承認', 
  'Act. Finish': '実績終了', 
  'Act. Start': '実績開始', 
  'Comments': 'コメント', 
  'Gantt Chart': 'ガントチャート', 
  'Print': '印刷', 
  'Export': '出力', 
  'Export Excel': 'Excel出力', 
  'Search task...': 'タスクを検索...', 
  'Search in project...': 'プロジェクトを検索...', 
  'Notes': 'メモ', 
  'Action': 'アクション', 
  'Task Name': 'タスク名', 
  'Task': 'タスク', 
  'Act. Status': '実績ステータス', 
  'Predecessor': '先行タスク', 
  'Baseline Finish': '基準終了', 
  'Baseline Start': '基準開始', 
  'Duration': '期間',
  // Navigation
  'Report': 'レポート',
  'Index': 'インデックス',
  'Financial': '財務',
  'Input': '入力',
  'Calendar': 'カレンダー',
  'Gantt': 'ガントチャート',
  'Summary': 'サマリー',
  'General': '概況',
  'Task detail': 'タスク詳細',
  'Budget': '予算',
  'Delegation': '委任',
  'Del. Calendar': '委任カレンダー',
  'Cost': 'コスト',
  'Access': 'アクセス',
  'Notifs': '通知',
  'Settings': '設定',

  // Header
  'Login': 'ログイン',
  'Logout': 'ログアウト',
  'Acc control': 'アクセス制御',
  'Takashimaya Project': '高島屋プロジェクト',
  'Taka PM': '高島屋PM',
  'Cloud Online': 'オンライン',
  'Syncing...': '同期中...',
  'Offline': 'オフライン',
  'ADMIN': '管理者',
  'GUEST': 'ゲスト',
  'Cloud Sync Enabled': 'クラウド同期有効',
  'Set 1st page': '最初のページに設定',
  'This page has been set as your start page.': 'このページをスタートページに設定しました。',

  // General tab
  'All Years': 'すべての年',
  'All Stores': 'すべての店舗',
  'All Locations': 'すべての場所',
  'All Statuses': 'すべてのステータス',
  'On process': '進行中',
  'Upcoming': '予定',
  'Completed': '完了',
  'Handover': '引継ぎ',
  'Canceled': 'キャンセル',
  'Search anything...': '検索...',
  'Google Sync': 'Google同期',
  'Sync to Google Sheets': 'Googleスプレッドシートに同期',
  'Year': '年',
  'Store': '店舗',
  'Location': '場所',
  'Code': 'コード',
  'Project': 'プロジェクト',
  'Project Name': 'プロジェクト名',
  'Status': 'ステータス',
  'Details': '詳細',
  'Pj Start': 'PJ開始',
  'Pj Compl': 'PJ完了',
  'Opening': 'オープン',
  'Tak start': '開始',
  'Tak compl': '完了',
  'Total': '合計',
  'projects': 'プロジェクト',
  'Detail': '詳細',

  // Budget
  'Search in budget...': '予算で検索...',
  'Has Budget or Act/Forc': '予算または実績あり',
  'Has Budget': '予算あり',
  'Has Act/Forc': '実績あり',
  'All Projects': 'すべてのプロジェクト',
  'Variance': '差異',
  'Type': 'タイプ',
  'Note': 'メモ',

  // Summary Tab
  'Start Month': '開始月',
  'End Month': '終了月',
  'Period Summary': '期間サマリー',
  'Budget vs Actual': '予算対実績',
  'Budget vs Actual (Count)': '予算対実績 (件数)',
  'Total Budget': '総予算',
  'Total Actual': '総実績',
  'Avg Cost/Project': '平均コスト/プロジェクト',
  'Projects in Period': '期間内のプロジェクト',

  // Task Details
  'Name': '名前',
  'Start': '開始',
  'Finish': '終了',
  'Assignee': '担当者',
  'Party': '関係者',
  'Phase': 'フェーズ',
  'Actual Start': '実績開始',
  'Actual Finish': '実績終了',

  // More strings
  'Add Project': 'プロジェクトを追加',
  'Add Task': 'タスクを追加',
  'Edit': '編集',
  'Delete': '削除',
  'Cancel': 'キャンセル',
  'Save': '保存',
  'Submit': '送信',
  'Select...': '選択...',
  'Confirm': '確認',
  'Are you sure?': '本当によろしいですか？',
  'Task con': 'サブタスク',
  'Project Start': 'プロジェクト開始',
  'Project Finish': 'プロジェクト完了',
  'Task Start': 'タスク開始',
  'Task Finish': 'タスク完了',
  'No events scheduled for this day.': 'この日に予定されているイベントはありません。',
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = safeGetItemLocal('taka_language');
    return (saved as Language) || 'en';
  });

  useEffect(() => {
    safeSetItemLocal('taka_language', language);
  }, [language]);

  const t = (text: string): string => {
    if (language === 'en') return text;
    return jaDictionary[text] || text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

import React, { useRef } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Book, Download, Info } from "lucide-react";
import { cn } from "../lib/utils";

export function ManualTab() {
  const { t } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      const htmlToImage = await import("html-to-image");
      const imgData = await htmlToImage.toPng(printRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save("Taka_PM_User_Manual.pdf");
    } catch (err) {
      console.error("PDF generation failed", err);
    }
  };

  const manualContent = [
    {
      title: t("1. System Overview"),
      content: t("Taka PM is a comprehensive project management system, supporting offline-first operations (can be used when network is lost and auto-syncs when online). The system revolves around 2 main objects: Project and Task.")
    },
    {
      title: t("2. Project & Task Management (Core Modules)"),
      items: [
        t("General Tab: Main dashboard. Displays a summary list of all projects. You can filter projects by Year, Store, Status and view overall progress."),
        t("Detail Tab: Displays details of Tasks inside each Project. Click on a Project/Task to open the detail Modal. Inside the Modal, you can edit info, view comments and tag others (e.g. @username or #taskname)."),
        t("Gantt Tab: Visualizes project progress in real-time. Drag and drop progress bars to change start/end dates. Supports setting Predecessor relationships between tasks. Supports exporting charts to image or PDF files."),
        t("Calendar Tab: Displays tasks on a monthly/weekly calendar to easily track Milestones.")
      ]
    },
    {
      title: t("3. Financial Management"),
      items: [
        t("Budget Tab: Track overall project budgets and Variances between Budget and Actual."),
        t("Cost Tab: Manage detailed cash flows. Track Act/Forecast, 1st/2nd/3rd Paid installments. Track Tie-up cost and Final (aft Tie-up) costs. Inline edit and CSV Export/Import.")
      ]
    },
    {
      title: t("4. Delegation & Approval"),
      items: [
        t("Delegation Tab: Where tasks are transferred and handed over to other departments/groups."),
        t("Status Workflow: Delegated tasks can change status such as: Accepted, ReqApproval, Approved, Rejected."),
        t("Del. Calendar Tab: A dedicated calendar to track delegated tasks, clearly distinguished by colors (e.g., tasks requesting approval, overdue tasks).")
      ]
    },
    {
      title: t("5. Reporting & Analytics"),
      items: [
        t("Summary / Report Tab: Provides visual charts (Bar charts, pie charts) showing project counts, completion rates, and financial status (Budget vs Actual) across periods.")
      ]
    },
    {
      title: t("6. Access Control & Administration"),
      items: [
        t("Access Tab: Strictly for Admins. Add/Edit/Delete Users and Groups. Assign Roles: ADMIN, GUEST, or assign permissions by specific function Groups."),
        t("Notification Tab: View latest updates when someone tags you or there are changes on tasks you manage.")
      ]
    },
    {
      title: t("7. System Settings"),
      items: [
        t("Multilingual: Click the language icon (EN/JA) at the top right to switch the entire interface."),
        t("Dark Mode: Moon/Sun icon at the top right."),
        t("Offline Mode: The app auto-saves data to the browser if the network drops. When online, 'Cloud Sync Enabled' appears and it syncs to the server.")
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3 text-slate-800 dark:text-white">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
            <Book className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("User Manual")}</h1>
            <p className="text-slate-500 dark:text-slate-400">{t("Taka PM System Documentation")}</p>
          </div>
        </div>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          {t("Download PDF")}
        </button>
      </div>

      <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-sm border border-slate-200 dark:border-[#444446] overflow-hidden">
        {/* Printable Area */}
        <div ref={printRef} className="p-6 md:p-10 bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-slate-200">
          <div className="mb-10 text-center border-b border-slate-200 dark:border-[#444446] pb-6">
            <h2 className="text-3xl font-black mb-2 text-slate-900 dark:text-white">{t("Taka PM")}</h2>
            <h3 className="text-xl text-slate-600 dark:text-slate-400 uppercase tracking-widest">{t("User Manual")}</h3>
          </div>

          <div className="space-y-10">
            {manualContent.map((section, idx) => (
              <div key={idx} className="space-y-4">
                <h4 className="text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <Info className="w-5 h-5 opacity-70" />
                  {section.title}
                </h4>
                {section.content && (
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-lg">
                    {section.content}
                  </p>
                )}
                {section.items && (
                  <ul className="list-disc list-outside ml-6 space-y-3">
                    {section.items.map((item, iIdx) => {
                      const parts = item.split(':');
                      if (parts.length > 1) {
                        return (
                          <li key={iIdx} className="text-slate-700 dark:text-slate-300 leading-relaxed text-lg pl-2">
                            <strong className="text-slate-900 dark:text-white">{parts[0]}:</strong>
                            {parts.slice(1).join(':')}
                          </li>
                        )
                      }
                      return (
                        <li key={iIdx} className="text-slate-700 dark:text-slate-300 leading-relaxed text-lg pl-2">
                          {item}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

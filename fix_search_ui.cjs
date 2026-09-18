const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `      <div className="absolute top-4 right-4 z-10">
         <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg text-sm font-medium transition-colors">
            <Download className="w-4 h-4" /> Xuất ảnh HD
         </button>
      </div>`;

const replacement = `      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
         <div className="relative group">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm Unit / Brand / Project..."
              className="pl-9 pr-4 py-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all w-64"
            />
            {searchQuery && (
               <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
               </button>
            )}
         </div>
         <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg text-sm font-medium transition-colors flex-shrink-0">
            <Download className="w-4 h-4" /> Xuất ảnh HD
         </button>
      </div>`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);

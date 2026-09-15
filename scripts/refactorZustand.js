const fs = require('fs');

const code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

// The file has:
// export const useAppStore = create<AppState>((set) => ({
// ... 
// }));

let newCode = code.replace(
  /export const useAppStore = create<AppState>\(\(set\) => \(\{([\s\S]*?)\}\)\);/,
  `
import { StateCreator } from 'zustand';

// --- SLICES ---
export const createPrintSlice: StateCreator<AppState> = (set) => ({
$1
});

export const useAppStore = create<AppState>((set, get, api) => ({
  ...createPrintSlice(set, get, api),
}));
`
);

fs.writeFileSync('src/store/useAppStore.new.ts', newCode);
console.log("Created useAppStore.new.ts");

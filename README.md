# Hướng Dẫn Tích Hợp Tab Picture (DataMapping Canvas)

## 1. Cài đặt các thư viện cần thiết (NPM):
```bash
npm install react-konva konva use-image uuid lucide-react react-dropzone pdfjs-dist papaparse jspdf @aws-sdk/client-s3 @aws-sdk/s3-request-presigner motion clsx tailwind-merge zustand firebase
```

## 2. Thư mục và file đã được cấu trúc sẵn:
- `src/components/DataMappingTab.tsx` (Component chính chứa các sub-tab Edit, Hierarchy, Dynamic Hierarchy, Review)
- `src/components/DataMapping/types.ts` (Các type định nghĩa UnitShape, MapVersion, Group...)
- `src/components/DataMapping/EditTab.tsx` (Bộ vẽ Canvas Konva, vẽ shape, đo kích thước, import ảnh/PDF mặt bằng)
- `src/components/DataMapping/HierarchyTab.tsx` (Phân cấp danh mục tĩnh)
- `src/components/DataMapping/DynamicHierarchyTab.tsx` (Bộ luật đổi màu linh hoạt theo tầng/khu vực)
- `src/components/DataMapping/ReviewTab.tsx` (Màn hình Review xuất ảnh JPEG, PDF, Cloudflare R2, Google Drive)
- `src/components/DataMapping/ReviewOnlyView.tsx` (Chế độ xem độc lập khi chia sẻ link)
- `src/hooks/useDynamicRules.ts`
- `src/lib/summaryData.ts`
- `src/lib/r2Upload.ts`
- `src/components/R2UploadModal.tsx`
- `src/lib/drive.ts`
- `src/lib/auth.ts`
- `src/lib/utils.ts`

## 3. Khởi tạo State trong Zustand (src/DataContext.tsx):
Component `DataMappingTab` đọc các biến state sau từ `useDataStore`:
- `store`: 'HCM' | 'HN'
- `mapUnits`: UnitShape[]
- `setMapUnits`: (units: UnitShape[]) => void
- `mapVersions`: MapVersion[]
- `setMapVersions`: (versions: MapVersion[]) => void
- `activeMapVersionId`: string | null
- `setActiveMapVersionId`: (id: string | null) => void
- `reviewSelectedLabels`: string[]
- `setReviewSelectedLabels`: (labels: string[]) => void
- `unitInfo`: any[]
- `projectStatus`: any[]

## 4. Sử dụng Component:
```tsx
import DataMappingTab from './components/DataMappingTab';

export default function App() {
  return (
    <div className="w-screen h-screen bg-slate-950 text-white">
      <DataMappingTab />
    </div>
  );
}
```

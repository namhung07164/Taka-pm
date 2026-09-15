import { storage } from './firebase';
import { ref, deleteObject } from 'firebase/storage';

export const extractStorageUrls = (item: any): string[] => {
  if (!item) return [];
  const urls = new Set<string>();
  
  if (item.fileUrl && item.fileUrl.includes('firebasestorage.googleapis.com')) urls.add(item.fileUrl);
  if (item.childFileUrl && item.childFileUrl.includes('firebasestorage.googleapis.com')) urls.add(item.childFileUrl);
  if (item.image && item.image.includes('firebasestorage.googleapis.com')) urls.add(item.image);
  
  if (item.attachments && Array.isArray(item.attachments)) {
    item.attachments.forEach((att: any) => {
      if (att.url && att.url.includes('firebasestorage.googleapis.com')) urls.add(att.url);
    });
  }
  
  if (item.comments && Array.isArray(item.comments)) {
    item.comments.forEach((c: any) => {
      if (c.text) {
        const matches = c.text.match(/(https?:\/\/[^\s]+)/g) || [];
        matches.forEach((url: string) => {
          if (url.includes('firebasestorage.googleapis.com')) urls.add(url);
        });
      }
      if (c.attachments && Array.isArray(c.attachments)) {
        c.attachments.forEach((att: any) => {
           if (att.url && att.url.includes('firebasestorage.googleapis.com')) urls.add(att.url);
        });
      }
    });
  }
  
  return Array.from(urls);
};

export const deleteStorageFiles = async (urls: string[]) => {
  if (!urls || urls.length === 0) return;
  for (const url of urls) {
    try {
      const fileRef = ref(storage, url);
      await deleteObject(fileRef);
    } catch (e) {
      console.error("Failed to clean orphan storage file:", url, e);
    }
  }
};

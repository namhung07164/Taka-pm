import React, { useState, useEffect } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) return null;
  
  const target = document.getElementById('portal-root') || document.body;
  return createPortal(children, target);
}

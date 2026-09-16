import React from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ color, onChange, className }: ColorPickerProps) {
  return (
    <input
      type="color"
      value={color}
      onChange={(e) => onChange(e.target.value)}
      className={`w-6 h-6 border-0 p-0 cursor-pointer rounded-full overflow-hidden ${className || ''}`}
    />
  );
}

export default ColorPicker;


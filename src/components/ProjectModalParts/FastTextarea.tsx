import React, { forwardRef, useEffect, useRef, useState } from 'react';

interface FastTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
}

export const FastTextarea = React.forwardRef<HTMLTextAreaElement, FastTextareaProps>(
  ({ value, onChange, ...props }, ref) => {
    const [local, setLocal] = useState(value);
    const isCanceling = React.useRef(false);

    useEffect(() => {
      setLocal(value);
    }, [value]);

    return (
      <textarea
        {...props}
        ref={ref}
        value={local}
        onChange={(e) => {
          const val = e.target.value;
          setLocal(val);
          onChange(val);
          if (props.onChangeCapture) props.onChangeCapture(e);
        }}
        onBlur={(e) => {
          if (!isCanceling.current) {
            onChange(local);
          }
          isCanceling.current = false;
          if (props.onBlur) props.onBlur(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            isCanceling.current = true;
            setLocal(value);
            onChange(value);
            e.currentTarget.blur();
          }
          if (props.onKeyDown) props.onKeyDown(e);
        }}
      />
    );
  }
);

FastTextarea.displayName = 'FastTextarea';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';

export interface SwipeAction {
  label: string;
  icon: React.ReactNode;
  color?: string; // Tailwind background color, e.g. 'bg-rose-600', 'bg-blue-600'
  textColor?: string;
  onClick: (e: React.MouseEvent | React.TouchEvent) => void;
  isPrimary?: boolean;
  isDestructive?: boolean;
}

export interface SwipeableRowProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[]; // Revealed on Swipe Right (-->)
  rightActions?: SwipeAction[]; // Revealed on Swipe Left (<--)
  onFullSwipeLeft?: () => void;
  onFullSwipeRight?: () => void;
  fullSwipeThreshold?: number; // px, defaults to 160
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}

export const SwipeableRow = React.memo(function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  onFullSwipeLeft,
  onFullSwipeRight,
  fullSwipeThreshold = 170,
  disabled = false,
  className,
  containerClassName,
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState<'left' | 'right' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const touchDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);
  const hasTriggeredHapticRef = useRef(false);

  const leftActionsWidth = leftActions.length * 75;
  const rightActionsWidth = rightActions.length * 75;

  const closeActions = useCallback(() => {
    setOffsetX(0);
    setIsOpen(null);
    setIsDragging(false);
  }, []);

  // Close row on click outside if open
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeActions();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, closeActions]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || e.touches.length > 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    touchDirectionRef.current = null;
    hasTriggeredHapticRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (disabled || e.touches.length > 1) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartRef.current.x;
    const diffY = touch.clientY - touchStartRef.current.y;

    // Disambiguate horizontal swipe vs vertical page scroll within first 8px
    if (!touchDirectionRef.current) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        if (Math.abs(diffY) > Math.abs(diffX)) {
          touchDirectionRef.current = 'vertical';
          return;
        } else {
          touchDirectionRef.current = 'horizontal';
          setIsDragging(true);
          if (containerRef.current) {
            containerRef.current.setAttribute('data-swipeable-active', 'true');
          }
        }
      } else {
        return;
      }
    }

    if (touchDirectionRef.current !== 'horizontal') return;

    // Prevent native scroll once horizontal swipe is confirmed
    if (e.cancelable) {
      e.preventDefault();
    }

    let targetX = diffX;
    if (isOpen === 'left') targetX += leftActionsWidth;
    if (isOpen === 'right') targetX -= rightActionsWidth;

    // Boundary constraints with rubber-band resistance
    if (targetX > 0 && leftActions.length === 0) {
      targetX = Math.min(targetX * 0.15, 20); // Resistance when no actions
    } else if (targetX < 0 && rightActions.length === 0) {
      targetX = Math.max(targetX * 0.15, -20);
    } else if (targetX > leftActionsWidth) {
      const over = targetX - leftActionsWidth;
      targetX = leftActionsWidth + over * 0.35;
    } else if (targetX < -rightActionsWidth) {
      const over = Math.abs(targetX) - rightActionsWidth;
      targetX = -(rightActionsWidth + over * 0.35);
    }

    // Subtle haptic bump when crossing full swipe threshold
    const isPastLeftThreshold = targetX > fullSwipeThreshold && Boolean(onFullSwipeRight || leftActions[0]);
    const isPastRightThreshold = targetX < -fullSwipeThreshold && Boolean(onFullSwipeLeft || rightActions[0]);
    if ((isPastLeftThreshold || isPastRightThreshold) && !hasTriggeredHapticRef.current) {
      hasTriggeredHapticRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(12);
        } catch {
          // Ignore
        }
      }
    } else if (!isPastLeftThreshold && !isPastRightThreshold) {
      hasTriggeredHapticRef.current = false;
    }

    setOffsetX(targetX);
  };

  const handleTouchEnd = () => {
    if (containerRef.current) {
      containerRef.current.removeAttribute('data-swipeable-active');
    }

    if (touchDirectionRef.current !== 'horizontal') {
      setIsDragging(false);
      return;
    }

    setIsDragging(false);

    // Full Swipe Right (-->): triggers primary left action
    if (offsetX > fullSwipeThreshold) {
      if (onFullSwipeRight) {
        onFullSwipeRight();
      } else if (leftActions.length > 0) {
        leftActions[0].onClick({} as any);
      }
      closeActions();
      return;
    }

    // Full Swipe Left (<--): triggers primary right action
    if (offsetX < -fullSwipeThreshold) {
      if (onFullSwipeLeft) {
        onFullSwipeLeft();
      } else if (rightActions.length > 0) {
        // Trigger primary action (usually the first action or primary marked)
        const primary = rightActions.find((a) => a.isPrimary) || rightActions[0];
        primary.onClick({} as any);
      }
      closeActions();
      return;
    }

    // Snap points
    if (offsetX > 35 && leftActions.length > 0) {
      setOffsetX(leftActionsWidth);
      setIsOpen('left');
    } else if (offsetX < -35 && rightActions.length > 0) {
      setOffsetX(-rightActionsWidth);
      setIsOpen('right');
    } else {
      closeActions();
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden touch-pan-y select-none rounded-xl', containerClassName)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Left Action Buttons (Revealed when swiped right -->) */}
      {leftActions.length > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-stretch z-0 overflow-hidden"
          style={{ width: Math.max(offsetX, 0) }}
        >
          {leftActions.map((action, idx) => (
            <button
              key={action.label || idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(e);
                closeActions();
              }}
              className={cn(
                'flex-1 flex flex-col items-center justify-center px-3 py-2 text-white font-bold text-xs gap-1 transition-all active:scale-95 cursor-pointer touch-manipulation',
                action.color || 'bg-emerald-600',
                action.textColor || 'text-white'
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">{action.icon}</div>
              <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Right Action Buttons (Revealed when swiped left <--) */}
      {rightActions.length > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex items-stretch justify-end z-0 overflow-hidden"
          style={{ width: Math.max(-offsetX, 0) }}
        >
          {rightActions.map((action, idx) => (
            <button
              key={action.label || idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(e);
                closeActions();
              }}
              className={cn(
                'flex-1 flex flex-col items-center justify-center px-3 py-2 text-white font-bold text-xs gap-1 transition-all active:scale-95 cursor-pointer touch-manipulation',
                action.color || (action.isDestructive ? 'bg-rose-600' : 'bg-blue-600'),
                action.textColor || 'text-white'
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">{action.icon}</div>
              <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Swiping Content */}
      <div
        className={cn('relative z-10 bg-inherit transition-transform', className)}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.2, 0.9, 0.2, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
});

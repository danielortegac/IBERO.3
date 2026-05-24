
import React, { useState, useEffect, useRef } from 'react';

interface SwipeInput {
  onSwipedLeft?: (startX: number) => void;
  onSwipedRight?: (startX: number) => void;
  onSwipedUp?: (startY: number) => void;
  onSwipedDown?: (startY: number) => void;
}

export const useSwipe = ({ onSwipedLeft, onSwipedRight, onSwipedUp, onSwipedDown }: SwipeInput) => {
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent | TouchEvent) => {
    touchEnd.current = null;
    touchEndY.current = null;
    const touch = 'touches' in e ? e.targetTouches[0] : (e as TouchEvent).touches[0];
    touchStart.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const onTouchMove = (e: React.TouchEvent | TouchEvent) => {
    const touch = 'touches' in e ? e.targetTouches[0] : (e as TouchEvent).touches[0];
    touchEnd.current = touch.clientX;
    touchEndY.current = touch.clientY;
    
    // Si el movimiento es predominantemente horizontal, evitamos el scroll vertical
    if (touchStart.current !== null && touchStartY.current !== null) {
        const xDiff = Math.abs(touchStart.current - touch.clientX);
        const yDiff = Math.abs(touchStartY.current - touch.clientY);
        if (xDiff > yDiff && xDiff > 10) {
            // No podemos hacer preventDefault aquí si no es pasivo, 
            // pero el touch-action: pan-y en el CSS manejará la navegación del sistema.
        }
    }
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    
    const distanceX = touchStart.current - touchEnd.current;
    const distanceY = (touchStartY.current || 0) - (touchEndY.current || 0);
    const isHorizontal = Math.abs(distanceX) > Math.abs(distanceY);

    const startX = touchStart.current || 0;
    const startY = touchStartY.current || 0;

    if (isHorizontal) {
      const isLeftSwipe = distanceX > minSwipeDistance;
      const isRightSwipe = distanceX < -minSwipeDistance;
      if (isLeftSwipe && onSwipedLeft) onSwipedLeft(startX);
      if (isRightSwipe && onSwipedRight) onSwipedRight(startX);
    } else {
        const isUpSwipe = distanceY > minSwipeDistance;
        const isDownSwipe = distanceY < -minSwipeDistance;
        if (isUpSwipe && onSwipedUp) onSwipedUp(startY);
        if (isDownSwipe && onSwipedDown) onSwipedDown(startY);
    }
    
    touchStart.current = null;
    touchStartY.current = null;
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
};

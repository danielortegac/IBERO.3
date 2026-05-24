import React from 'react';

type ControlButton = {
  label: React.ReactNode;
  ariaLabel: string;
  onPress: () => void;
  onRelease?: () => void;
  className?: string;
  wide?: boolean;
};

interface MobileGameControlsProps {
  left?: ControlButton;
  right?: ControlButton;
  up?: ControlButton;
  down?: ControlButton;
  action?: ControlButton;
  secondaryAction?: ControlButton;
  hint?: string;
  className?: string;
}

const fireRelease = (button?: ControlButton) => {
  button?.onRelease?.();
};

const ControlPadButton: React.FC<{ button?: ControlButton; fallback?: string; className?: string }> = ({ button, fallback = '', className = '' }) => {
  if (!button) return <div className={className} />;
  return (
    <button
      type="button"
      aria-label={button.ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        button.onPress();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        fireRelease(button);
      }}
      onPointerCancel={() => fireRelease(button)}
      onPointerLeave={() => fireRelease(button)}
      className={`touch-none select-none rounded-2xl border border-white/10 bg-white/10 active:bg-white/25 backdrop-blur-md text-white font-black shadow-lg shadow-black/30 transition-transform active:scale-95 min-h-[52px] flex items-center justify-center ${button.wide ? 'px-8' : 'px-5'} ${button.className || ''} ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'none' }}
    >
      {button.label ?? fallback}
    </button>
  );
};

const MobileGameControls: React.FC<MobileGameControlsProps> = ({ left, right, up, down, action, secondaryAction, hint, className = '' }) => {
  return (
    <div className={`md:hidden w-full max-w-md mx-auto mt-3 px-1 ${className}`} style={{ touchAction: 'none' }}>
      {hint && <div className="text-center text-[10px] uppercase tracking-[0.18em] font-black text-white/35 mb-2">{hint}</div>}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div className="grid grid-cols-3 gap-2">
          <div />
          <ControlPadButton button={up} className="min-w-[54px]" />
          <div />
          <ControlPadButton button={left} className="min-w-[54px]" />
          <ControlPadButton button={down} className="min-w-[54px]" />
          <ControlPadButton button={right} className="min-w-[54px]" />
        </div>
        <div className="w-2" />
        <div className="flex flex-col gap-2 items-stretch justify-end">
          <ControlPadButton button={secondaryAction} className="min-w-[96px] bg-white/5" />
          <ControlPadButton button={action} className="min-w-[110px] bg-brand-primary/80 text-black border-brand-primary/40" />
        </div>
      </div>
    </div>
  );
};

export default MobileGameControls;

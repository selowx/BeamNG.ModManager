import React from 'react';
import { BeamngModManagerLockup } from './BeamngLogo';

export interface SplashScreenProps {
  visible: boolean;
  exiting: boolean;
}

export function SplashScreen({ visible, exiting }: SplashScreenProps) {
  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#161922] flex flex-col items-center justify-center select-none transition-opacity duration-500 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div
        className={`animate-bng-splash-zoom flex flex-col items-center ${
          exiting ? 'transition-transform duration-500 scale-110' : ''
        }`}
      >
        <BeamngModManagerLockup />

        {/* Progress Bar */}
        <div className="w-64 h-[2px] bg-[#282e3c] overflow-hidden mt-6">
          <div className="w-1/2 h-full bg-[#ff6600] animate-bng-splash-bar" />
        </div>
      </div>
    </div>
  );
}

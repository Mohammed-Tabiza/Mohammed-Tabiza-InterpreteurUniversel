import React from 'react';

interface VisualizerProps {
  isActive: boolean;
  audioLevel: number; // 0 to 1
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, audioLevel }) => {
  // Normalize volume for visualization
  const distinctBars = 5;
  
  return (
    <div className="flex items-center justify-center gap-1.5 h-12">
      {Array.from({ length: distinctBars }).map((_, i) => {
        // Create a wave effect
        const heightMultiplier = isActive ? Math.max(0.2, audioLevel * (1 + Math.random())) : 0.1;
        const h = Math.min(100, Math.max(10, heightMultiplier * 100));
        
        return (
          <div
            key={i}
            className={`w-2 rounded-full transition-all duration-75 ${isActive ? 'bg-indigo-500' : 'bg-slate-300'}`}
            style={{
              height: `${h}%`,
              opacity: isActive ? 1 : 0.5,
              animation: isActive ? `pulse 1s infinite ${i * 0.1}s` : 'none'
            }}
          />
        );
      })}
    </div>
  );
};

export default Visualizer;
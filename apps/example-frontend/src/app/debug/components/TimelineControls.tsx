"use client";

interface TimelineControlsProps {
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onJumpToStep: (step: number) => void;
  onTogglePlay: () => void;
  onSetSpeed: (speed: number) => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];

/**
 * VCR-style timeline controls for stepping through events.
 */
export function TimelineControls({
  currentStep,
  totalSteps,
  isPlaying,
  playbackSpeed,
  onStepForward,
  onStepBackward,
  onJumpToStart,
  onJumpToEnd,
  onJumpToStep,
  onTogglePlay,
  onSetSpeed,
}: TimelineControlsProps) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const isAtStart = currentStep === 0;
  const isAtEnd = currentStep >= totalSteps;

  return (
    <div className="bg-slate-800 rounded-lg px-4 py-3 flex items-center gap-4">
      {/* VCR Controls */}
      <div className="flex items-center gap-1">
        {/* Jump to start */}
        <button
          onClick={onJumpToStart}
          disabled={isAtStart}
          className="w-8 h-8 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title="Jump to start"
        >
          <span className="text-xs font-bold">|◀</span>
        </button>

        {/* Step backward */}
        <button
          onClick={onStepBackward}
          disabled={isAtStart}
          className="w-8 h-8 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title="Step backward"
        >
          <span className="text-sm">◀</span>
        </button>

        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          disabled={isAtEnd && !isPlaying}
          className="w-10 h-8 flex items-center justify-center rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title={isPlaying ? "Pause" : "Play"}
        >
          <span className="text-sm">{isPlaying ? "⏸" : "▶"}</span>
        </button>

        {/* Step forward */}
        <button
          onClick={onStepForward}
          disabled={isAtEnd}
          className="w-8 h-8 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title="Step forward"
        >
          <span className="text-sm">▶</span>
        </button>

        {/* Jump to end */}
        <button
          onClick={onJumpToEnd}
          disabled={isAtEnd}
          className="w-8 h-8 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title="Jump to end"
        >
          <span className="text-xs font-bold">▶|</span>
        </button>
      </div>

      {/* Progress Slider */}
      <div className="flex-1 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={totalSteps}
          value={currentStep}
          onChange={(e) => onJumpToStep(parseInt(e.target.value, 10))}
          className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          style={{
            background: `linear-gradient(to right, #10b981 0%, #10b981 ${progress}%, #475569 ${progress}%, #475569 100%)`,
          }}
        />
        <div className="text-slate-300 text-sm font-mono min-w-[80px] text-right">
          {currentStep} / {totalSteps}
        </div>
      </div>

      {/* Speed Control */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-xs">Speed:</span>
        <select
          value={playbackSpeed}
          onChange={(e) => onSetSpeed(parseFloat(e.target.value))}
          className="bg-slate-700 text-white text-sm rounded px-2 py-1 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {SPEED_OPTIONS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

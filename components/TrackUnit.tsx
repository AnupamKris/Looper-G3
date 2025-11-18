
import React, { useRef, useEffect } from 'react';
import { TrackData, TrackStatus } from '../types';
import { TRACK_THEMES } from '../constants';
import { Mic, Trash2, Volume2, VolumeX, Square, Play, Disc, Repeat, Repeat1 } from 'lucide-react';

interface TrackUnitProps {
  track: TrackData;
  analyser?: AnalyserNode;
  onRecord: (id: number) => void;
  onPlayStop: (id: number) => void;
  onClear: (id: number) => void;
  onMute: (id: number) => void;
  onVolume: (id: number, val: number) => void;
  onToggleLoop: (id: number) => void;
}

export const TrackUnit: React.FC<TrackUnitProps> = ({ track, analyser, onRecord, onPlayStop, onClear, onMute, onVolume, onToggleLoop }) => {
  const theme = TRACK_THEMES[track.id % TRACK_THEMES.length];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isArmed = track.status === TrackStatus.ARMED;
  const isRecording = track.status === TrackStatus.RECORDING;
  const isPlaying = track.status === TrackStatus.PLAYING;
  const hasAudio = track.buffer !== null;

  // Track Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      // Matches Zinc 950
      ctx.fillStyle = '#09090b'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Only draw if active
      if (!isPlaying && !isRecording) return;

      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.hex; 
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isPlaying, isRecording, theme.hex]);


  return (
    <div className={`relative flex flex-row items-center gap-0 border-b border-zinc-800 bg-zinc-950 transition-all duration-300 ${isRecording ? 'bg-zinc-900/50' : ''}`}>
      
      {/* Track Info & Visualizer */}
      <div className="flex items-stretch w-24 md:w-auto h-16 md:h-20 shrink-0">
         <div className={`flex items-center justify-center w-10 md:w-16 font-mono text-lg md:text-xl border-r border-zinc-800 ${theme.class} shrink-0`}>
            {track.id + 1}
         </div>
         {/* Visualizer - Hidden on very small screens if needed, or kept small */}
         <div className="flex-1 md:w-48 bg-black border-r border-zinc-800 relative hidden sm:block">
             <canvas ref={canvasRef} width={192} height={80} className="w-full h-full opacity-90" />
             <div className={`absolute top-0 left-0 bottom-0 w-1 ${isPlaying ? 'bg-white' : 'bg-transparent'}`}></div>
         </div>
      </div>

      {/* Actions Area */}
      <div className="flex flex-1 gap-px bg-zinc-800 h-16 md:h-20">
          
          {/* Record Button */}
          <button 
            onClick={() => onRecord(track.id)}
            className={`flex-1 font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2
              ${isRecording 
                ? 'bg-white text-black' 
                : isArmed 
                  ? 'bg-zinc-400 text-black'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            title="Record (Overwrite)"
          >
            <Disc size={18} className={isRecording ? "text-red-600" : ""} />
            <span className="hidden sm:inline">{isRecording ? 'REC' : isArmed ? 'ARMED' : 'REC'}</span>
          </button>

          {/* Play/Stop Button */}
          <button 
            onClick={() => onPlayStop(track.id)}
            disabled={!hasAudio && !isRecording && !isArmed}
            className={`flex-1 font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2
                ${isPlaying
                    ? 'bg-zinc-200 text-black hover:bg-white'
                    : track.status === TrackStatus.STOPPED
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                        : 'bg-zinc-950 text-zinc-600 cursor-not-allowed'
                }`}
            title="Play / Stop"
          >
             {isPlaying ? <Square size={18} /> : <Play size={18} />}
             <span className="hidden sm:inline">{isPlaying ? 'STOP' : 'PLAY'}</span>
          </button>
      </div>

      {/* Mix Controls */}
      <div className="flex items-center gap-0 h-16 md:h-20 border-l border-zinc-800 bg-zinc-900">
        
        {/* Loop Toggle - Hidden on very small mobile to save space */}
        <button 
            onClick={() => onToggleLoop(track.id)}
            className={`w-10 md:w-12 h-full flex items-center justify-center border-r border-zinc-800 transition-colors ${track.isLooping ? 'bg-zinc-950 text-white' : 'bg-zinc-950 text-zinc-600'}`}
            title={track.isLooping ? "Looping On" : "Looping Off (One Shot)"}
        >
            {track.isLooping ? <Repeat size={14} /> : <Repeat1 size={14} />}
        </button>

        {/* Volume Slider - Compact on mobile */}
        <div className="flex items-center justify-center px-2 md:px-4 w-20 md:w-28 h-full border-r border-zinc-800 bg-zinc-950">
            <input 
                type="range" 
                min="0" max="1" step="0.01"
                value={track.volume}
                onChange={(e) => onVolume(track.id, parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-700 appearance-none cursor-pointer accent-white rounded-none"
            />
        </div>

        {/* Mute Toggle */}
        <button 
            onClick={() => onMute(track.id)}
            className={`w-10 md:w-12 h-full flex items-center justify-center border-r border-zinc-800 transition-colors ${track.isMuted ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
            title="Mute"
        >
            {track.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Clear Button */}
        <button 
            onClick={() => onClear(track.id)}
            className="w-10 md:w-12 h-full flex items-center justify-center bg-zinc-950 text-zinc-600 hover:text-white hover:bg-zinc-900 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            disabled={!hasAudio && !isRecording}
            title="Clear Track"
        >
            <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

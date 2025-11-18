
import React, { useRef, useEffect } from 'react';
import { DrumTrack, PlaybackState } from '../types';
import { Volume2, VolumeX, Trash2, XCircle } from 'lucide-react';
import { AVAILABLE_DRUM_INSTRUMENTS } from '../constants';

interface DrumSequencerProps {
    track: DrumTrack;
    playbackState: PlaybackState;
    settings: { beatsPerBar: number };
    analyser: AnalyserNode | null;
    onToggleStep: (trackId: number, inst: string, index: number) => void;
    onClear: (trackId: number) => void;
    onVolume: (trackId: number, val: number) => void;
    onMute: (trackId: number) => void;
    onRemove: (trackId: number) => void;
}

export const DrumSequencer: React.FC<DrumSequencerProps> = ({
    track,
    playbackState,
    settings,
    analyser,
    onToggleStep,
    onClear,
    onVolume,
    onMute,
    onRemove
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // We assume the pattern length matches beatsPerBar * 4
    const totalSteps = settings.beatsPerBar * 4;
    const currentBarFloat = (playbackState.progress * (settings as any).bars) || 0; 
    const barProgress = currentBarFloat % 1; 
    const currentStepIndex = Math.floor(barProgress * totalSteps);

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

            ctx.fillStyle = '#09090b'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // If muted, dim the visualizer
            if (track.isMuted) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                return;
            }

            ctx.lineWidth = 2;
            ctx.strokeStyle = '#a1a1aa'; // Zinc 400
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
    }, [analyser, track.isMuted]);

    return (
        <div className="w-full bg-zinc-950 border-t border-zinc-800 flex flex-col md:flex-row relative group mb-1">
            {/* Remove Button (Absolute top right) */}
            <button 
                onClick={() => onRemove(track.id)}
                className="absolute top-2 right-2 z-20 text-zinc-700 hover:text-red-500 transition-colors"
                title="Remove Percussion Track"
            >
                <XCircle size={16} />
            </button>

            {/* Controls & Visualizer */}
            <div className="w-full md:w-48 border-r border-zinc-800 flex flex-row md:flex-col">
                 {/* Visualizer Area */}
                 <div className="flex-1 h-16 md:h-24 bg-black relative border-b border-zinc-800 md:border-b-0">
                    <canvas ref={canvasRef} width={192} height={96} className="w-full h-full" />
                    <div className="absolute top-2 left-2 text-xs font-mono text-zinc-500 uppercase tracking-wider">{track.name}</div>
                 </div>
                 
                 {/* Controls */}
                 <div className="h-16 md:h-auto flex-1 bg-zinc-900 flex items-center justify-center gap-2 px-2">
                      <button onClick={() => onMute(track.id)} className="text-zinc-400 hover:text-white">
                          {track.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <input 
                        type="range" min="0" max="1" step="0.01" 
                        value={track.volume} onChange={(e) => onVolume(track.id, parseFloat(e.target.value))}
                        className="w-16 h-1 bg-zinc-700 appearance-none accent-zinc-300"
                      />
                      <button onClick={() => onClear(track.id)} className="text-zinc-500 hover:text-red-400 ml-2">
                          <Trash2 size={16} />
                      </button>
                 </div>
            </div>

            {/* Sequencer Grid */}
            <div className={`flex-1 p-4 overflow-x-auto custom-scrollbar bg-zinc-950 transition-opacity ${track.isMuted ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="min-w-[600px] flex flex-col gap-2">
                    {AVAILABLE_DRUM_INSTRUMENTS.map(inst => (
                        <div key={inst} className="flex items-center gap-2 h-8">
                            <div className="w-16 text-[9px] font-mono text-zinc-500 uppercase tracking-widest text-right pr-2 pt-1">
                                {inst}
                            </div>
                            <div className="flex-1 flex gap-1 h-full">
                                {(track.pattern[inst] || []).slice(0, totalSteps).map((isActive, idx) => {
                                    const isBeatStart = idx % 4 === 0;
                                    const isCurrent = playbackState.isPlaying && idx === currentStepIndex;
                                    
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => onToggleStep(track.id, inst, idx)}
                                            className={`
                                                flex-1 h-full rounded-none transition-all duration-75
                                                ${isActive 
                                                    ? 'bg-zinc-200 shadow-[0_0_10px_rgba(255,255,255,0.3)]' 
                                                    : isBeatStart ? 'bg-zinc-800' : 'bg-zinc-900'
                                                }
                                                ${isCurrent ? 'brightness-150 ring-1 ring-white z-10' : 'hover:bg-zinc-700'}
                                            `}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    
                    {/* Beat Indicators (Footer) */}
                    <div className="flex gap-2 pl-[72px] pt-1"> 
                         {Array.from({ length: settings.beatsPerBar }).map((_, i) => (
                             <div key={i} className="flex-1 flex gap-1">
                                 <div className="flex-1 text-[9px] text-zinc-600 text-center font-mono">{i + 1}</div>
                                 <div className="flex-1"></div>
                                 <div className="flex-1"></div>
                                 <div className="flex-1"></div>
                             </div>
                         ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

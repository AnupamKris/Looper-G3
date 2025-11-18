
import React, { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';

interface InputOscilloscopeProps {
    analyser: AnalyserNode | null;
    micGain: number;
    onMicGainChange: (val: number) => void;
}

export const InputOscilloscope: React.FC<InputOscilloscopeProps> = ({ analyser, micGain, onMicGainChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

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

            ctx.fillStyle = '#000'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.lineWidth = 2;
            ctx.strokeStyle = '#22d3ee'; // Vibrant Cyan
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

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, [analyser]);

    if (!analyser) return <div className="h-24 bg-black border-t border-zinc-800 flex items-center justify-center text-zinc-700 font-mono text-xs">MIC OFF</div>;

    return (
        <div className="h-24 bg-black border-t border-b border-zinc-800 relative flex">
            <div className="absolute top-1 left-1 text-[10px] text-zinc-500 font-mono uppercase tracking-widest z-10 pointer-events-none">Input Signal</div>
            
            <div className="flex-1 relative">
                <canvas ref={canvasRef} width={600} height={100} className="w-full h-full opacity-100" />
            </div>
            
            {/* Mic Controls Overlay or Side Panel */}
            <div className="w-32 bg-zinc-950 border-l border-zinc-800 flex flex-col items-center justify-center p-2 gap-1 z-10">
                <div className="flex items-center gap-1 text-zinc-400 mb-1">
                    <Mic size={12} />
                    <span className="text-[10px] font-mono uppercase">Gain</span>
                </div>
                <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.1" 
                    value={micGain}
                    onChange={(e) => onMicGainChange(parseFloat(e.target.value))}
                    className="w-24 h-1 bg-zinc-800 appearance-none accent-white cursor-pointer"
                />
                <span className="text-[10px] font-mono text-zinc-500 mt-1">{(micGain * 100).toFixed(0)}%</span>
            </div>
        </div>
    );
};

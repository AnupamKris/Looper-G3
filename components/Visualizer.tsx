
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { PlaybackState, LooperSettings } from '../types';

interface VisualizerProps {
  playbackState: PlaybackState;
  settings: LooperSettings;
}

export const Visualizer: React.FC<VisualizerProps> = ({ playbackState, settings }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // D3 Drawing Logic
  useEffect(() => {
    if (!svgRef.current) return;
    
    const width = 300;
    const height = 300;
    const radius = Math.min(width, height) / 2 - 20;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll("*").remove(); 

    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Background Ring (Zinc-800)
    g.append("circle")
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "#27272a") // zinc-800
      .attr("stroke-width", 2);

    // Beat Markers (Square ticks)
    const beatsPerBar = settings.beatsPerBar || 4;
    const totalBeats = settings.bars * beatsPerBar;
    const anglePerBeat = (2 * Math.PI) / totalBeats;

    for (let i = 0; i < totalBeats; i++) {
        const angle = i * anglePerBeat - Math.PI / 2;
        // Is this the start of a bar?
        const isBarStart = i % beatsPerBar === 0;
        const markerLen = isBarStart ? 15 : 8;
        
        const x1 = (radius - markerLen) * Math.cos(angle);
        const y1 = (radius - markerLen) * Math.sin(angle);
        const x2 = (radius + markerLen/2) * Math.cos(angle);
        const y2 = (radius + markerLen/2) * Math.sin(angle);
        
        g.append("line")
          .attr("x1", x1)
          .attr("y1", y1)
          .attr("x2", x2)
          .attr("y2", y2)
          .attr("stroke", isBarStart ? "#a1a1aa" : "#52525b") // zinc-400 / zinc-600
          .attr("stroke-width", isBarStart ? 2 : 1);
    }

    // Progress Arc (White sharp)
    const arc = d3.arc()
      .innerRadius(radius - 4)
      .outerRadius(radius + 4)
      .startAngle(0)
      .endAngle(playbackState.progress * 2 * Math.PI);

    g.append("path")
      .attr("d", arc as any)
      .attr("fill", "#fff") 
      .attr("opacity", playbackState.isPlaying ? 1 : 0);

    // Center Text
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("fill", "#fff")
      .attr("font-size", "32px")
      .attr("font-family", "monospace")
      .attr("font-weight", "bold")
      .text(playbackState.isPlaying ? `${playbackState.currentBar}.${playbackState.currentBeat}` : "STOP");

     g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.5em")
      .attr("fill", "#a1a1aa") // zinc-400
      .attr("font-size", "14px")
      .attr("font-family", "monospace")
      .text(`${settings.bpm} BPM`);

  }, [playbackState, settings]);

  return (
    <div className="flex justify-center items-center p-4">
      <svg ref={svgRef} width={300} height={300} />
    </div>
  );
};

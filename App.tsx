
import React, { useState } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import { TrackUnit } from './components/TrackUnit';
import { Visualizer } from './components/Visualizer';
import { InputOscilloscope } from './components/InputOscilloscope';
import { DrumSequencer } from './components/DrumSequencer';
import { MIN_BPM, MAX_BPM } from './constants';
import { Play, Square, Music, Activity, Plus, Mic2, Sliders, Drum, Settings } from 'lucide-react';
import { TrackStatus } from './types';

type MobileTab = 'loop' | 'drums' | 'config';

const App: React.FC = () => {
  const {
    tracks,
    settings,
    setSettings,
    playbackState,
    togglePlay,
    recordTrack,
    playStopTrack,
    clearTrack,
    toggleMute,
    setVolume,
    toggleTrackLoop,
    inputAnalyser,
    getTrackAnalyser,
    micGain,
    setMicGain,
    // Drum Props
    drumTracks,
    addDrumTrack,
    removeDrumTrack,
    toggleDrumStep,
    clearDrumPattern,
    setDrumTrackVolume,
    toggleDrumTrackMute,
    getDrumTrackAnalyser
  } = useAudioEngine();

  const [activeTab, setActiveTab] = useState<MobileTab>('loop');

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans selection:bg-white selection:text-black flex flex-col h-screen overflow-hidden">
      
      {/* Top Bar (Header) */}
      <header className="w-full border-b border-zinc-800 bg-zinc-950 shrink-0 z-50">
        <div className="w-full px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white flex items-center justify-center shrink-0">
                   <Music className="text-black" size={16} />
                </div>
                <h1 className="text-lg md:text-xl font-bold tracking-tighter text-white truncate">
                  LOOPSTATION <span className="font-mono font-normal text-zinc-500 text-sm hidden sm:inline">PRO</span>
                </h1>
            </div>

            {/* Top Controls (Global Transport) */}
             <div className="flex items-center gap-2 md:gap-4">
                 {/* Metronome Toggle (Desktop) */}
                 <div className="hidden md:flex items-center gap-4 border-r border-zinc-800 pr-6 mr-2">
                     <div className="flex items-center gap-2">
                         <Activity size={16} className={settings.metronomeActive ? "text-white" : "text-zinc-700"} />
                         <button 
                             onClick={() => setSettings({...settings, metronomeActive: !settings.metronomeActive})}
                             className={`text-xs font-mono uppercase px-2 py-1 border ${settings.metronomeActive ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                         >
                             Metronome
                         </button>
                         {settings.metronomeActive && (
                             <input 
                                 type="range" min="0" max="1" step="0.1"
                                 value={settings.metronomeVolume}
                                 onChange={(e) => setSettings({...settings, metronomeVolume: parseFloat(e.target.value)})}
                                 className="w-16 h-1 bg-zinc-800 appearance-none accent-white cursor-pointer"
                             />
                         )}
                     </div>
                 </div>

                 {/* Global Play/Stop */}
                 <button 
                    onClick={togglePlay}
                    className={`h-10 px-4 md:px-6 font-mono font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-colors
                      ${playbackState.isPlaying 
                        ? 'bg-white text-black hover:bg-zinc-200' 
                        : 'bg-zinc-800 text-white hover:bg-zinc-700'
                      }`}
                  >
                    {playbackState.isPlaying ? <Square size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                    <span className="hidden sm:inline">{playbackState.isPlaying ? 'STOP' : 'PLAY'}</span>
                  </button>
             </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden relative">
           
           {/* LEFT PANEL: Configuration & Visualizer (Desktop: Left Sidebar, Mobile: Tab Content) */}
           <div className={`
               w-full lg:w-[400px] bg-zinc-950 border-r border-zinc-800 flex-col overflow-y-auto custom-scrollbar shrink-0
               ${activeTab === 'config' ? 'flex' : 'hidden lg:flex'}
           `}>
               
               {/* Visualizer Container */}
               <div className="p-8 flex items-center justify-center border-b border-zinc-800 bg-black min-h-[300px]">
                  <Visualizer playbackState={playbackState} settings={settings} />
               </div>

               {/* Settings Controls */}
               <div className="p-6 space-y-8 pb-24 lg:pb-6">
                  
                  {/* Mobile Metronome Control (Duplicate for mobile view) */}
                  <div className="lg:hidden space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Metronome</label>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setSettings({...settings, metronomeActive: !settings.metronomeActive})}
                                className={`text-xs font-mono uppercase px-3 py-1 border ${settings.metronomeActive ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-500'}`}
                            >
                                {settings.metronomeActive ? 'ON' : 'OFF'}
                            </button>
                        </div>
                      </div>
                  </div>

                  {/* BPM */}
                  <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Tempo</label>
                        <span className="text-4xl font-bold text-white tracking-tighter">{settings.bpm} <span className="text-sm text-zinc-600 font-normal">BPM</span></span>
                      </div>
                      <input 
                        type="range" 
                        min={MIN_BPM} max={MAX_BPM} 
                        value={settings.bpm}
                        onChange={(e) => setSettings({...settings, bpm: parseInt(e.target.value)})}
                        className="w-full h-1 bg-zinc-800 appearance-none cursor-pointer accent-white rounded-none"
                      />
                  </div>
                  
                  {/* Time Signature */}
                  <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Time Sig</label>
                        <span className="text-4xl font-bold text-white tracking-tighter">{settings.beatsPerBar}<span className="text-xl text-zinc-600">/4</span></span>
                      </div>
                      <div className="grid grid-cols-6 gap-0 border border-zinc-800">
                        {[2, 3, 4, 5, 6, 7].map((beat, idx) => (
                          <button
                            key={beat}
                            onClick={() => setSettings({...settings, beatsPerBar: beat})}
                            className={`py-3 font-mono text-sm transition-colors 
                                ${idx !== 5 ? 'border-r border-zinc-800' : ''}
                                ${settings.beatsPerBar === beat ? 'bg-white text-black font-bold' : 'bg-black text-zinc-500 hover:text-white'}`}
                          >
                            {beat}
                          </button>
                        ))}
                      </div>
                  </div>

                  {/* Bars */}
                  <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Length</label>
                        <span className="text-4xl font-bold text-white tracking-tighter">{settings.bars} <span className="text-sm text-zinc-600 font-normal">BARS</span></span>
                      </div>
                      <div className="grid grid-cols-4 gap-0 border border-zinc-800">
                        {[1, 2, 4, 8].map((bar, idx) => (
                          <button
                            key={bar}
                            onClick={() => setSettings({...settings, bars: bar})}
                            className={`py-3 font-mono text-sm transition-colors 
                                ${idx !== 3 ? 'border-r border-zinc-800' : ''}
                                ${settings.bars === bar ? 'bg-white text-black font-bold' : 'bg-black text-zinc-500 hover:text-white'}`}
                          >
                            {bar}
                          </button>
                        ))}
                      </div>
                  </div>
               </div>
               
               {/* Oscilloscope (Desktop Placement) */}
               <div className="hidden lg:block mt-auto">
                   <InputOscilloscope analyser={inputAnalyser} micGain={micGain} onMicGainChange={setMicGain} />
               </div>
           </div>

           {/* RIGHT PANEL: Tracks & Drums (Desktop: Main Content, Mobile: Split Tabs) */}
           <div className={`
               flex-1 bg-black overflow-y-auto custom-scrollbar p-0 flex-col
               ${activeTab === 'loop' || activeTab === 'drums' || window.innerWidth >= 1024 ? 'flex' : 'hidden'}
           `}>
              
              {/* Input Oscilloscope (Mobile: Top of Loop View) */}
              <div className="lg:hidden">
                  <InputOscilloscope analyser={inputAnalyser} micGain={micGain} onMicGainChange={setMicGain} />
              </div>

              {/* LOOPER TRACKS */}
              <div className={`flex flex-col ${activeTab === 'loop' || window.innerWidth >= 1024 ? 'block' : 'hidden'}`}>
                {tracks.map(track => (
                  <TrackUnit 
                    key={track.id} 
                    track={track}
                    analyser={
                        (track.status === TrackStatus.RECORDING || track.status === TrackStatus.ARMED) 
                        ? inputAnalyser || undefined
                        : getTrackAnalyser(track.id)
                    }
                    onRecord={recordTrack}
                    onPlayStop={playStopTrack}
                    onClear={clearTrack}
                    onMute={toggleMute}
                    onVolume={setVolume}
                    onToggleLoop={toggleTrackLoop}
                  />
                ))}
                <div className="min-h-[100px] lg:hidden"></div>
              </div>
              
              {/* DRUM SEQUENCER */}
              <div className={`flex flex-col border-t-4 border-zinc-900 ${activeTab === 'drums' || window.innerWidth >= 1024 ? 'block' : 'hidden'}`}>
                  {drumTracks.map(drumTrack => (
                      <DrumSequencer 
                        key={drumTrack.id}
                        track={drumTrack}
                        playbackState={playbackState}
                        settings={settings}
                        analyser={getDrumTrackAnalyser(drumTrack.id)}
                        onToggleStep={toggleDrumStep}
                        onClear={clearDrumPattern}
                        onVolume={setDrumTrackVolume}
                        onMute={toggleDrumTrackMute}
                        onRemove={removeDrumTrack}
                    />
                  ))}

                  {/* Add Drum Track Button */}
                  <div className="flex items-center justify-center p-6 bg-zinc-950 border-t border-zinc-800 mb-24 lg:mb-0">
                      <button 
                        onClick={addDrumTrack}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border border-zinc-800"
                      >
                          <Plus size={16} />
                          <span className="font-mono text-xs uppercase tracking-widest">Add Percussion Track</span>
                      </button>
                  </div>
              </div>
           </div>

           {/* MOBILE BOTTOM NAVIGATION */}
           <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 h-16 flex items-center justify-around z-50">
               <button 
                   onClick={() => setActiveTab('loop')}
                   className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${activeTab === 'loop' ? 'text-white bg-zinc-900' : 'text-zinc-500'}`}
               >
                   <Mic2 size={20} />
                   <span className="text-[10px] font-mono uppercase tracking-widest">Loop</span>
               </button>
               <button 
                   onClick={() => setActiveTab('drums')}
                   className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${activeTab === 'drums' ? 'text-white bg-zinc-900' : 'text-zinc-500'}`}
               >
                   <Drum size={20} />
                   <span className="text-[10px] font-mono uppercase tracking-widest">Drums</span>
               </button>
               <button 
                   onClick={() => setActiveTab('config')}
                   className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${activeTab === 'config' ? 'text-white bg-zinc-900' : 'text-zinc-500'}`}
               >
                   <Settings size={20} />
                   <span className="text-[10px] font-mono uppercase tracking-widest">Config</span>
               </button>
           </div>

      </div>
    </div>
  );
};

export default App;

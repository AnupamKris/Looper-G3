
import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackData, TrackStatus, LooperSettings, PlaybackState, DrumPattern, DrumTrack, DrumInstrument } from '../types';
import { TRACK_COUNT, DEFAULT_BEATS, AVAILABLE_DRUM_INSTRUMENTS } from '../constants';

export const useAudioEngine = () => {
  // --- State ---
  const [settings, setSettings] = useState<LooperSettings>({ 
    bpm: 120, 
    beatsPerBar: DEFAULT_BEATS,
    bars: 4,
    metronomeActive: false,
    metronomeVolume: 0.5
  });
  
  const [tracks, setTracks] = useState<TrackData[]>(
    Array.from({ length: TRACK_COUNT }).map((_, i) => ({
      id: i,
      status: TrackStatus.EMPTY,
      volume: 0.8,
      isMuted: false,
      isLooping: true,
      buffer: null,
      color: '', 
    }))
  );

  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentBeat: 1,
    currentBar: 1,
    progress: 0,
    totalTime: 0,
  });

  const [micGain, setMicGain] = useState<number>(1.0);

  // Drum State
  const [drumTracks, setDrumTracks] = useState<DrumTrack[]>([
    {
      id: 1,
      name: 'Main Drums',
      pattern: AVAILABLE_DRUM_INSTRUMENTS.reduce((acc, inst) => ({ ...acc, [inst]: new Array(16).fill(false) }), {}),
      volume: 0.8,
      isMuted: false
    }
  ]);

  // --- Refs (The Source of Truth for the Audio Scheduler) ---
  const tracksRef = useRef<TrackData[]>(tracks);
  const settingsRef = useRef<LooperSettings>(settings);
  const isPlayingRef = useRef<boolean>(false);
  const drumTracksRef = useRef<DrumTrack[]>(drumTracks);
  
  // Timing Refs
  const nextLoopStartRef = useRef<number>(0);
  const nextBeatTimeRef = useRef<number>(0); // For metronome
  const nextStepTimeRef = useRef<number>(0); // For drums (16th notes)
  const currentBeatCountRef = useRef<number>(0); // Absolute beat count from start
  const currentStepCountRef = useRef<number>(0); // Absolute step count (16th notes)
  const loopDurationRef = useRef<number>(0);
  
  // Audio Context & Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const metronomeGainRef = useRef<GainNode | null>(null);
  
  // Drum Nodes Map (TrackID -> Nodes)
  const drumTrackGainsRef = useRef<Map<number, GainNode>>(new Map());
  const drumTrackAnalysersRef = useRef<Map<number, AnalyserNode>>(new Map());
  
  // Microphone Path
  const micGainNodeRef = useRef<GainNode | null>(null);
  const micDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  const sourceNodesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const trackGainsRef = useRef<Map<number, GainNode>>(new Map());
  const trackAnalysersRef = useRef<Map<number, AnalyserNode>>(new Map());
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  
  // Recording
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const activeRecordingTrackIdRef = useRef<number | null>(null);

  const requestRef = useRef<number>();

  // --- Synchronization ---
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { drumTracksRef.current = drumTracks; }, [drumTracks]);
  
  // Manage Drum Audio Nodes when tracks change
  useEffect(() => {
      const ctx = audioContextRef.current;
      const master = masterGainRef.current;
      if (!ctx || !master) return;

      // Add new nodes
      drumTracks.forEach(dt => {
          if (!drumTrackGainsRef.current.has(dt.id)) {
              const gain = ctx.createGain();
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              
              gain.connect(analyser);
              analyser.connect(master);
              
              gain.gain.value = dt.isMuted ? 0 : dt.volume;
              
              drumTrackGainsRef.current.set(dt.id, gain);
              drumTrackAnalysersRef.current.set(dt.id, analyser);
          } else {
              // Update existing volume/mute
              const gain = drumTrackGainsRef.current.get(dt.id);
              if (gain) {
                  gain.gain.setValueAtTime(dt.isMuted ? 0 : dt.volume, ctx.currentTime);
              }
          }
      });

      // Cleanup old nodes
      Array.from(drumTrackGainsRef.current.keys()).forEach(id => {
          if (!drumTracks.find(dt => dt.id === id)) {
              const gain = drumTrackGainsRef.current.get(id);
              const analyser = drumTrackAnalysersRef.current.get(id);
              gain?.disconnect();
              analyser?.disconnect();
              drumTrackGainsRef.current.delete(id);
              drumTrackAnalysersRef.current.delete(id);
          }
      });

  }, [drumTracks]);


  // Resize drum pattern if beatsPerBar changes
  useEffect(() => {
     const totalSteps = settings.beatsPerBar * 4;
     setDrumTracks(prevTracks => prevTracks.map(dt => {
         const newPattern = { ...dt.pattern };
         Object.keys(newPattern).forEach(key => {
             const currentArr = newPattern[key];
             if (currentArr.length !== totalSteps) {
                 const newArr = new Array(totalSteps).fill(false);
                 for(let i=0; i<Math.min(currentArr.length, totalSteps); i++) {
                     newArr[i] = currentArr[i];
                 }
                 newPattern[key] = newArr;
             }
         });
         return { ...dt, pattern: newPattern };
     }));
  }, [settings.beatsPerBar]);

  useEffect(() => { 
      settingsRef.current = settings; 
      const beatsPerBar = settings.beatsPerBar;
      const secondsPerBeat = 60 / settings.bpm;
      loopDurationRef.current = secondsPerBeat * beatsPerBar * settings.bars;
      
      if (metronomeGainRef.current) {
        metronomeGainRef.current.gain.value = settings.metronomeVolume;
      }
  }, [settings]);

  useEffect(() => {
      if (micGainNodeRef.current) {
          micGainNodeRef.current.gain.setValueAtTime(micGain, audioContextRef.current?.currentTime || 0);
      }
  }, [micGain]);


  // --- Core Audio Logic ---

  const initAudio = async () => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioContextRef.current = ctx;
      
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      const metronomeGain = ctx.createGain();
      metronomeGain.gain.value = settingsRef.current.metronomeVolume;
      metronomeGain.connect(masterGain);
      metronomeGainRef.current = metronomeGain;

      // Initialize track nodes
      tracksRef.current.forEach(t => {
        const g = ctx.createGain();
        g.gain.value = t.volume;
        
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        
        analyser.connect(g);
        g.connect(masterGain);
        
        trackGainsRef.current.set(t.id, g);
        trackAnalysersRef.current.set(t.id, analyser);
      });

      // Initialize Drum Nodes (for initial track)
      drumTracksRef.current.forEach(dt => {
         if (!drumTrackGainsRef.current.has(dt.id)) {
              const gain = ctx.createGain();
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              gain.connect(analyser);
              analyser.connect(masterGain);
              gain.gain.value = dt.isMuted ? 0 : dt.volume;
              drumTrackGainsRef.current.set(dt.id, gain);
              drumTrackAnalysersRef.current.set(dt.id, analyser);
         }
      });

      // Microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                latency: 0
            } as any
        });
        mediaStreamRef.current = stream;
        
        const source = ctx.createMediaStreamSource(stream);
        
        // Create Gain Node for Mic Boost
        const micGainNode = ctx.createGain();
        micGainNode.gain.value = 1.0; // Default
        micGainNodeRef.current = micGainNode;

        // Connect Source -> Gain
        source.connect(micGainNode);

        // Visualizer
        const inputAnalyser = ctx.createAnalyser();
        inputAnalyser.fftSize = 1024;
        micGainNode.connect(inputAnalyser);
        inputAnalyserRef.current = inputAnalyser;

        // Create Destination for Recorder (Records post-gain)
        const micDest = ctx.createMediaStreamDestination();
        micGainNode.connect(micDest);
        micDestinationRef.current = micDest;

      } catch (err) {
        console.error("Error accessing microphone:", err);
        // alert("Microphone access is required.");
      }
    } else if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  // --- Helper: Update Track Status ---
  const updateTrackStatus = (id: number, status: TrackStatus) => {
      const track = tracksRef.current.find(t => t.id === id);
      if (track) track.status = status;
      setTracks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  // --- Drum Synthesizer ---
  const playDrumSound = (instrument: string, time: number, destination: GainNode) => {
    const ctx = audioContextRef.current;
    if (!ctx || !destination) return;

    // Simple Drum Synthesis
    switch(instrument) {
        case 'KICK': {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(destination);

            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            
            gain.gain.setValueAtTime(1.0, time); 
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

            osc.start(time);
            osc.stop(time + 0.5);
            break;
        }
        case 'SNARE': {
            // Noise
            const bufferSize = ctx.sampleRate * 0.5; 
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            
            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = 1000;

            const noiseGain = ctx.createGain();
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(destination);

            noiseGain.gain.setValueAtTime(1.0, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            
            noise.start(time);
            noise.stop(time + 0.2);

            // Tone for snap
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            const oscGain = ctx.createGain();
            osc.connect(oscGain);
            oscGain.connect(destination);
            osc.frequency.setValueAtTime(250, time); 
            oscGain.gain.setValueAtTime(0.5, time);
            oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
            osc.start(time);
            osc.stop(time + 0.1);
            break;
        }
        case 'HIHAT': {
            const bufferSize = ctx.sampleRate * 0.3; 
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 7000;

            const gain = ctx.createGain();
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(destination);

            gain.gain.setValueAtTime(0.8, time); 
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

            noise.start(time);
            noise.stop(time + 0.05);
            break;
        }
        case 'CLAP': {
             const bufferSize = ctx.sampleRate * 0.3; 
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1500;
            filter.Q.value = 1;

            const gain = ctx.createGain();
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(destination);

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(1.0, time + 0.005); 
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

            noise.start(time);
            noise.stop(time + 0.2);
            break;
        }
        case 'TOM': {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(destination);

            osc.frequency.setValueAtTime(200, time);
            osc.frequency.exponentialRampToValueAtTime(80, time + 0.3);

            gain.gain.setValueAtTime(0.8, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);

            osc.start(time);
            osc.stop(time + 0.3);
            break;
        }
        case 'SHAKER': {
            const bufferSize = ctx.sampleRate * 0.1;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 5000;

            const gain = ctx.createGain();
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(destination);

            gain.gain.setValueAtTime(0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

            noise.start(time);
            noise.stop(time + 0.05);
            break;
        }
        case 'COWBELL': {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            osc1.type = 'square';
            osc2.type = 'square';
            osc1.frequency.value = 800;
            osc2.frequency.value = 580;

            const gain = ctx.createGain();
            osc1.connect(gain);
            osc2.connect(gain);
            
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;

            gain.connect(filter);
            filter.connect(destination);

            gain.gain.setValueAtTime(0.6, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

            osc1.start(time);
            osc2.start(time);
            osc1.stop(time + 0.1);
            osc2.stop(time + 0.1);
            break;
        }
        case 'CRASH': {
            const bufferSize = ctx.sampleRate * 1.5; // Long decay
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 3000;

            const gain = ctx.createGain();
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(destination);

            gain.gain.setValueAtTime(0.7, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 1.5);

            noise.start(time);
            noise.stop(time + 1.5);
            break;
        }
    }
  };

  // --- Metronome Sound ---
  const playClick = (time: number, isMeasureStart: boolean) => {
    const ctx = audioContextRef.current;
    const gain = metronomeGainRef.current;
    if (!ctx || !gain) return;

    const osc = ctx.createOscillator();
    const clickGain = ctx.createGain();

    osc.connect(clickGain);
    clickGain.connect(gain);

    // Stronger chime for Time Signature Start (High Pitch)
    osc.frequency.value = isMeasureStart ? 1500 : 800; 
    const volume = isMeasureStart ? 1.0 : 0.3; 
    
    clickGain.gain.setValueAtTime(volume, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.start(time);
    osc.stop(time + 0.1);
  };

  // --- Scheduler Loop ---
  const schedule = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !isPlayingRef.current) return;

    const currentTime = ctx.currentTime;
    const loopDuration = loopDurationRef.current;
    const currentSettings = settingsRef.current;
    
    // Initialization check
    if (nextLoopStartRef.current === 0 || nextLoopStartRef.current < currentTime - loopDuration) {
        nextLoopStartRef.current = currentTime + 0.1;
        nextBeatTimeRef.current = nextLoopStartRef.current;
        nextStepTimeRef.current = nextLoopStartRef.current;
    }

    // 1. UI Updates
    const timeSinceLoopStart = currentTime - (nextLoopStartRef.current - loopDuration);
    let progress = timeSinceLoopStart / loopDuration;
    if (progress > 1) progress %= 1;
    if (progress < 0) progress = 0;

    const beatsPerBar = currentSettings.beatsPerBar;
    const totalBeats = currentSettings.bars * beatsPerBar;
    const currentTotalBeat = Math.floor(progress * totalBeats);
    const currentBar = Math.floor(currentTotalBeat / beatsPerBar) + 1;
    const currentBeat = (currentTotalBeat % beatsPerBar) + 1;

    setPlaybackState({
      isPlaying: true,
      currentBar,
      currentBeat,
      progress,
      totalTime: currentTime
    });

    // 2. Metronome Scheduling (Lookahead 0.1s)
    const secondsPerBeat = 60.0 / currentSettings.bpm;
    
    while (nextBeatTimeRef.current < currentTime + 0.1) {
       if (currentSettings.metronomeActive) {
           // Is this beat the start of the TIME SIGNATURE?
           const isMeasureStart = (currentBeatCountRef.current % beatsPerBar) === 0;
           playClick(nextBeatTimeRef.current, isMeasureStart);
       }
       nextBeatTimeRef.current += secondsPerBeat;
       currentBeatCountRef.current++;
    }

    // 3. Drum Machine Scheduling (16th Notes)
    const secondsPerStep = secondsPerBeat / 4; // 16th note
    const stepsPerBar = beatsPerBar * 4;
    
    while (nextStepTimeRef.current < currentTime + 0.1) {
        // Determine current step index (0 - stepsPerBar-1)
        const stepIndex = currentStepCountRef.current % stepsPerBar;
        
        // Iterate over all drum tracks
        drumTracksRef.current.forEach(track => {
            if (!track.isMuted) {
                const gainNode = drumTrackGainsRef.current.get(track.id);
                if (gainNode) {
                    // Check each instrument in the track's pattern
                    Object.keys(track.pattern).forEach(key => {
                        if (track.pattern[key][stepIndex]) {
                            playDrumSound(key, nextStepTimeRef.current, gainNode);
                        }
                    });
                }
            }
        });

        nextStepTimeRef.current += secondsPerStep;
        currentStepCountRef.current++;
    }

    // 4. Loop Scheduling Lookahead
    if (nextLoopStartRef.current < currentTime + 0.1) {
       const playTime = nextLoopStartRef.current;
       
       // Playback
       tracksRef.current.forEach(track => {
         if (track.status === TrackStatus.PLAYING && track.buffer) {
             playBuffer(track, playTime);
         }
       });

       // Recording State Machine
       handleRecordingTransitions();

       // Advance Loop
       nextLoopStartRef.current += loopDuration;
    }

    requestRef.current = requestAnimationFrame(schedule);
  }, []); 

  // --- Recording Logic ---
  const handleRecordingTransitions = () => {
      const currentTracks = tracksRef.current;
      
      // A. Stop Recording (End of Loop)
      const recordingTrack = currentTracks.find(t => t.status === TrackStatus.RECORDING);
      if (recordingTrack && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          activeRecordingTrackIdRef.current = recordingTrack.id;
          updateTrackStatus(recordingTrack.id, TrackStatus.PLAYING);
      }

      // B. Start Recording (Start of Loop)
      const armedTrack = currentTracks.find(t => t.status === TrackStatus.ARMED);
      if (armedTrack && micDestinationRef.current) {
          recordedChunksRef.current = [];
          
          let options = {};
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
              options = { mimeType: 'audio/webm;codecs=opus' };
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options = { mimeType: 'audio/webm' };
          }

          const recorder = new MediaRecorder(micDestinationRef.current.stream, options);
          
          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };

          recorder.onstop = () => {
              const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
              if (activeRecordingTrackIdRef.current !== null) {
                  processRecording(activeRecordingTrackIdRef.current, blob);
              }
          };

          recorder.start();
          mediaRecorderRef.current = recorder;
          updateTrackStatus(armedTrack.id, TrackStatus.RECORDING);
      }
  };

  const processRecording = async (trackId: number, blob: Blob) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      
      try {
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

          const expectedDuration = loopDurationRef.current;
          const expectedSamples = Math.floor(expectedDuration * ctx.sampleRate);
          
          const cleanBuffer = ctx.createBuffer(
              audioBuffer.numberOfChannels || 1,
              expectedSamples,
              ctx.sampleRate
          );

          for (let channel = 0; channel < cleanBuffer.numberOfChannels; channel++) {
              const inputData = audioBuffer.getChannelData(channel % audioBuffer.numberOfChannels);
              const outputData = cleanBuffer.getChannelData(channel);
              for(let i=0; i<expectedSamples; i++) {
                  if (i < inputData.length) outputData[i] = inputData[i];
                  else outputData[i] = 0;
              }
          }

          setTracks(prev => prev.map(t => {
              if (t.id === trackId) {
                  return { ...t, buffer: cleanBuffer, status: TrackStatus.PLAYING };
              }
              return t;
          }));

      } catch (e) {
          console.error("Failed to process recording", e);
      }
  };

  const playBuffer = (track: TrackData, time: number) => {
    const ctx = audioContextRef.current;
    const analyser = trackAnalysersRef.current.get(track.id);
    if (!ctx || !analyser || !track.buffer) return;

    const existing = sourceNodesRef.current.get(track.id);
    if (existing) {
       try { existing.stop(time); } catch(e) {}
    }

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.loop = track.isLooping; 
    source.connect(analyser);
    source.start(time);
    sourceNodesRef.current.set(track.id, source);
  };

  // --- User Actions ---

  const togglePlay = async () => {
    if (!audioContextRef.current) {
      await initAudio();
    }
    
    if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
    }

    isPlayingRef.current = !isPlayingRef.current;
    
    if (isPlayingRef.current) {
        const startTime = audioContextRef.current!.currentTime + 0.05;
        nextLoopStartRef.current = startTime;
        
        nextBeatTimeRef.current = startTime;
        nextStepTimeRef.current = startTime;
        currentBeatCountRef.current = 0;
        currentStepCountRef.current = 0;

        requestRef.current = requestAnimationFrame(schedule);
    } else {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        setPlaybackState(prev => ({ ...prev, isPlaying: false }));
        
        sourceNodesRef.current.forEach(node => {
            try { node.stop(); } catch(e) {}
        });
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    }
  };

  const recordTrack = (id: number) => {
      if (!isPlayingRef.current) {
          togglePlay().then(() => {
            updateTrackStatus(id, TrackStatus.ARMED);
          });
      } else {
          setTracks(prev => prev.map(t => {
             if (t.id === id) return { ...t, status: TrackStatus.ARMED };
             if (t.status === TrackStatus.ARMED) return { ...t, status: t.buffer ? TrackStatus.PLAYING : TrackStatus.EMPTY };
             return t;
          }));
      }
  };

  const playStopTrack = (id: number) => {
      const track = tracksRef.current.find(t => t.id === id);
      if (!track) return;

      let newStatus = track.status;

      if (track.status === TrackStatus.EMPTY) return;
      if (track.status === TrackStatus.PLAYING) newStatus = TrackStatus.STOPPED;
      else if (track.status === TrackStatus.STOPPED) newStatus = TrackStatus.PLAYING;
      else if (track.status === TrackStatus.ARMED) newStatus = track.buffer ? TrackStatus.PLAYING : TrackStatus.EMPTY;
      else if (track.status === TrackStatus.RECORDING) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
          }
          newStatus = TrackStatus.PLAYING;
      }

      updateTrackStatus(id, newStatus);

      if (newStatus === TrackStatus.STOPPED) {
          const node = sourceNodesRef.current.get(id);
          try { node?.stop(); } catch(e) {}
      }
  };

  const clearTrack = (id: number) => {
      updateTrackStatus(id, TrackStatus.EMPTY);
      setTracks(prev => prev.map(t => t.id === id ? { ...t, buffer: null } : t));
  };

  const toggleMute = (id: number) => {
      setTracks(prev => prev.map(t => {
          if (t.id === id) {
              const newMute = !t.isMuted;
              const gainNode = trackGainsRef.current.get(id);
              if (gainNode) {
                  gainNode.gain.setValueAtTime(newMute ? 0 : t.volume, audioContextRef.current?.currentTime || 0);
              }
              return { ...t, isMuted: newMute };
          }
          return t;
      }));
  };

  const setVolume = (id: number, val: number) => {
       setTracks(prev => prev.map(t => {
          if (t.id === id) {
              const gainNode = trackGainsRef.current.get(id);
              if (gainNode && !t.isMuted) {
                  gainNode.gain.setValueAtTime(val, audioContextRef.current?.currentTime || 0);
              }
              return { ...t, volume: val };
          }
          return t;
       }));
  };

  const toggleTrackLoop = (id: number) => {
      setTracks(prev => prev.map(t => {
          if (t.id === id) {
              const newLooping = !t.isLooping;
              const sourceNode = sourceNodesRef.current.get(id);
              if (sourceNode) {
                  sourceNode.loop = newLooping;
              }
              return { ...t, isLooping: newLooping };
          }
          return t;
      }));
  };
  
  // --- Drum Actions ---
  
  const addDrumTrack = () => {
      setDrumTracks(prev => {
          const newId = prev.length > 0 ? Math.max(...prev.map(t => t.id)) + 1 : 1;
          return [...prev, {
              id: newId,
              name: `Percussion ${newId}`,
              pattern: AVAILABLE_DRUM_INSTRUMENTS.reduce((acc, inst) => ({ ...acc, [inst]: new Array(16).fill(false) }), {}),
              volume: 0.8,
              isMuted: false
          }];
      });
  };

  const removeDrumTrack = (id: number) => {
      setDrumTracks(prev => prev.filter(t => t.id !== id));
      // Cleanup audio nodes handled in useEffect
  };

  const toggleDrumStep = (trackId: number, instrument: string, stepIndex: number) => {
      setDrumTracks(prev => prev.map(dt => {
          if (dt.id === trackId) {
              const newPattern = { ...dt.pattern };
              if (newPattern[instrument]) {
                  const newSteps = [...newPattern[instrument]];
                  newSteps[stepIndex] = !newSteps[stepIndex];
                  newPattern[instrument] = newSteps;
              }
              return { ...dt, pattern: newPattern };
          }
          return dt;
      }));
  };
  
  const clearDrumPattern = (trackId: number) => {
      setDrumTracks(prev => prev.map(dt => {
          if (dt.id === trackId) {
              const newPattern: DrumPattern = {};
              Object.keys(dt.pattern).forEach(key => {
                  newPattern[key] = new Array(dt.pattern[key].length).fill(false);
              });
              return { ...dt, pattern: newPattern };
          }
          return dt;
      }));
  };

  const setDrumTrackVolume = (trackId: number, val: number) => {
      setDrumTracks(prev => prev.map(dt => dt.id === trackId ? { ...dt, volume: val } : dt));
  };

  const toggleDrumTrackMute = (trackId: number) => {
      setDrumTracks(prev => prev.map(dt => dt.id === trackId ? { ...dt, isMuted: !dt.isMuted } : dt));
  };

  return {
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
      micGain,
      setMicGain,
      initAudio,
      getTrackAnalyser: (id: number) => trackAnalysersRef.current.get(id),
      inputAnalyser: inputAnalyserRef.current,
      
      // Drum API
      drumTracks,
      addDrumTrack,
      removeDrumTrack,
      toggleDrumStep,
      clearDrumPattern,
      setDrumTrackVolume,
      toggleDrumTrackMute,
      getDrumTrackAnalyser: (id: number) => drumTrackAnalysersRef.current.get(id) || null
  };
};

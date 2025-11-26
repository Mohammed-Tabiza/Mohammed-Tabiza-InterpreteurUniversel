import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { Mic, MicOff, Globe, Wifi, Settings, AlertCircle, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { createBlob, decodeAudioData, decode, resampleTo16k } from './utils/audioUtils';
import { TranscriptItem } from './types';
import Visualizer from './components/Visualizer';
import Transcript from './components/Transcript';
import SettingsModal from './components/SettingsModal';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

const LANGUAGE_LOCALES: Record<string, string> = {
  'English': 'en-US',
  'French': 'fr-FR',
  'Spanish': 'es-ES',
  'German': 'de-DE',
  'Italian': 'it-IT',
  'Chinese': 'zh-CN',
  'Japanese': 'ja-JP',
  'Arabic': 'ar-SA',
  'Russian': 'ru-RU',
  'Portuguese': 'pt-PT',
  'Dutch': 'nl-NL',
};

// Helper to map short codes (e.g., 'es', 'fr') to full locales for TTS
const mapLanguageCodeToLocale = (shortCode?: string): string | undefined => {
  if (!shortCode) return undefined;
  const base = shortCode.split('-')[0].toLowerCase();
  const map: Record<string, string> = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'de': 'de-DE',
    'it': 'it-IT',
    'zh': 'zh-CN',
    'ja': 'ja-JP',
    'ar': 'ar-SA',
    'ru': 'ru-RU',
    'pt': 'pt-PT',
    'nl': 'nl-NL',
  };
  return map[base];
};

const getSystemInstruction = (targetLanguage: string) => `
You are a professional, highly skilled Universal Interpreter for a French service desk.
Your goal is to bridge communication between a French-speaking Host and a Client who may speak ${targetLanguage === 'Auto' ? 'ANY language' : targetLanguage}.

OPERATIONAL PROTOCOL:

1.  **LANGUAGE DETECTION**:
    *   **Host Side**: The Host always speaks **French**.
    *   **Client Side**: ${targetLanguage === 'Auto' 
          ? 'The Client may speak ANY world language. You must dynamically detect the language they are using sentence-by-sentence. If the client switches languages (e.g., from English to Spanish), you must adapt immediately.' 
          : `The Client speaks **${targetLanguage}**.`}

2.  **TRANSLATION LOGIC**:
    *   **Input is French** -> Translate to **${targetLanguage === 'Auto' ? 'the language currently spoken by the Client (or English if the interaction just started)' : targetLanguage}**.
    *   **Input is [Detected Non-French Language]** -> Translate immediately to **French**.

3.  **VOICE & PERSONA**:
    *   Voice Name: Kore.
    *   Tone: Professional, calm, polite, and reassuring.
    *   Pronunciation: Native-level in whichever language you are outputting.
    *   Style: Act as an invisible conduit. Do not translate the speaker's name or metadata. Do not say "He says...". Just speak the translated content directly.

4.  **SPECIAL HANDLING**:
    *   If the input is unintelligible or noise, remain silent.
    *   Maintain the nuances and politeness levels of the original speaker.
`;

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  
  // Streaming State for Real-time Feedback
  const [streamingUserText, setStreamingUserText] = useState('');
  const [streamingModelText, setStreamingModelText] = useState('');

  const [audioLevel, setAudioLevel] = useState(0);
  const [isOutputMuted, setIsOutputMuted] = useState(false);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [targetLanguage, setTargetLanguage] = useState('Auto');
  const [useBrowserTTS, setUseBrowserTTS] = useState(false);
  
  // Refs for settings to avoid stale closures in callbacks
  const useBrowserTTSRef = useRef(useBrowserTTS);
  const targetLanguageRef = useRef(targetLanguage);

  useEffect(() => {
    useBrowserTTSRef.current = useBrowserTTS;
  }, [useBrowserTTS]);

  useEffect(() => {
    targetLanguageRef.current = targetLanguage;
  }, [targetLanguage]);

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Analysers for visualization
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Refs for transcription management (to avoid stale closures)
  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');
  const currentInputLanguageRef = useRef<string | undefined>(undefined);
  const lastClientLanguageRef = useRef<string>('en-US'); // Default fallback

  // Keep a reference to the active utterance to prevent garbage collection
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Helper for Browser TTS
  const speakText = useCallback((text: string, isFrenchOutput: boolean) => {
    if (!('speechSynthesis' in window)) return;
    
    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance; // Store to prevent GC
    utterance.rate = 1.0;
    
    // Determine language
    if (isFrenchOutput) {
       utterance.lang = 'fr-FR';
    } else {
       // We need to speak in the foreign language
       const currentTarget = targetLanguageRef.current;
       
       if (currentTarget !== 'Auto' && LANGUAGE_LOCALES[currentTarget]) {
           // Explicit target selected
           utterance.lang = LANGUAGE_LOCALES[currentTarget];
       } else {
           // Auto mode: use the last detected client language
           // mapLanguageCodeToLocale handles 'es' -> 'es-ES' conversion
           const detectedLocale = mapLanguageCodeToLocale(lastClientLanguageRef.current);
           if (detectedLocale) {
               utterance.lang = detectedLocale;
           } else {
               // Fallback
               utterance.lang = 'en-US'; 
           }
       }
    }

    utterance.onend = () => {
      utteranceRef.current = null;
    };
    
    window.speechSynthesis.speak(utterance);
  }, []);

  const toggleMute = () => {
    const newMuted = !isOutputMuted;
    setIsOutputMuted(newMuted);
    if (outputGainRef.current) {
      outputGainRef.current.gain.value = newMuted ? 0 : 1;
    }
  };

  const replayLastOutput = () => {
    const lastModelMessage = [...transcripts].reverse().find(t => t.source === 'model');
    if (lastModelMessage && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(lastModelMessage.text);
      utterance.rate = 1.0;
      
      // Try to determine lang using current target logic as best guess
      if (targetLanguageRef.current !== 'Auto' && LANGUAGE_LOCALES[targetLanguageRef.current]) {
        utterance.lang = LANGUAGE_LOCALES[targetLanguageRef.current];
      }
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const connectToGemini = async () => {
    try {
      setError(null);
      
      // 1. Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass();
      audioContextRef.current = new AudioContextClass();
      
      // Ensure contexts are running (vital for some browsers)
      await inputContextRef.current.resume();
      await audioContextRef.current.resume();

      // Initialize Output Gain (Master Volume)
      outputGainRef.current = audioContextRef.current.createGain();
      outputGainRef.current.gain.value = isOutputMuted ? 0 : 1;
      outputGainRef.current.connect(audioContextRef.current.destination);

      // Initialize Analysers
      inputAnalyserRef.current = inputContextRef.current.createAnalyser();
      inputAnalyserRef.current.fftSize = 256;
      
      outputAnalyserRef.current = audioContextRef.current.createAnalyser();
      outputAnalyserRef.current.fftSize = 256;
      
      // Connect Output Analyser to Output Gain
      outputAnalyserRef.current.connect(outputGainRef.current);

      // Start Visualizer Loop
      startAudioMonitoring();

      // 2. Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Initialize Gemini API
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const config = {
        responseModalities: ["AUDIO"], 
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
        },
        systemInstruction: { parts: [{ text: getSystemInstruction(targetLanguage) }] },
        inputAudioTranscription: {}, 
        outputAudioTranscription: {}, 
      };

      // 4. Connect Live Session
      sessionPromiseRef.current = ai.live.connect({
        model: MODEL_NAME,
        config,
        callbacks: {
          onopen: async () => {
            console.log('Gemini Live Session Opened');
            setIsConnected(true);
            
            // Double check resume in case it suspended during setup
            if (inputContextRef.current?.state === 'suspended') await inputContextRef.current.resume();
            if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

            if (!inputContextRef.current || !streamRef.current || !inputAnalyserRef.current) return;
            
            const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
            const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const currentSampleRate = e.inputBuffer.sampleRate;
              const downsampledData = resampleTo16k(inputData, currentSampleRate);

              const pcmBlob = createBlob(downsampledData);
              sessionPromiseRef.current?.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(inputAnalyserRef.current);
            inputAnalyserRef.current.connect(processor);
            processor.connect(inputContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Text & Logic (Wrapped in try-catch to protect the loop)
            try {
              handleTranscription(message);
            } catch (e) {
              console.error("Error processing transcription message:", e);
            }

            // 2. Handle Audio
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            // Only play audio if Browser TTS is DISABLED
            if (!useBrowserTTSRef.current && base64Audio && audioContextRef.current && outputAnalyserRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                
                source.connect(outputAnalyserRef.current); // Connects to Gain -> Dest
                
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              } catch (err) {
                console.error("Audio decoding error:", err);
              }
            }

            if (message.serverContent?.interrupted) {
               sourcesRef.current.forEach(src => src.stop());
               sourcesRef.current.clear();
               nextStartTimeRef.current = 0;
               if (useBrowserTTSRef.current) window.speechSynthesis.cancel();
            }
          },
          onclose: () => {
            console.log('Session Closed');
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error('Session Error', err);
            if (err instanceof Error) {
               if (err.message.includes("Invalid argument")) {
                   setError("Configuration invalide (vérifiez les paramètres audio).");
               } else if (err.message.includes("Internal error")) {
                   console.warn("Gemini Internal Warning (retrying usually fixes this):", err.message);
               } else {
                   setError("Erreur de connexion avec l'IA.");
               }
            }
          }
        }
      });

    } catch (err) {
      console.error('Connection failed', err);
      setError("Impossible d'accéder au microphone ou de se connecter.");
      setIsConnected(false);
    }
  };

  const startAudioMonitoring = () => {
    const updateVolume = () => {
      let maxVol = 0;
      
      if (inputAnalyserRef.current) {
        const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
        inputAnalyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        maxVol = Math.max(maxVol, avg / 255);
      }

      if (outputAnalyserRef.current) {
        const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
        outputAnalyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        maxVol = Math.max(maxVol, (avg / 255) * 1.2); 
      }

      setAudioLevel(Math.min(1, maxVol));
      animationFrameRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();
  };

  const handleTranscription = (message: LiveServerMessage) => {
    // Input Transcription (User)
    if (message.serverContent?.inputTranscription) {
      const trans = message.serverContent.inputTranscription;
      const text = trans.text;
      if (text) {
        currentInputTransRef.current += text;
        setStreamingUserText(currentInputTransRef.current); 
      }
      
      // Safer language code extraction
      if (trans && 'languageCode' in trans) {
         const code = (trans as any).languageCode;
         if (code) {
           currentInputLanguageRef.current = code;
           // If it's not French, remember it as the client's language
           if (!code.toLowerCase().startsWith('fr')) {
             lastClientLanguageRef.current = code;
           }
         }
      }
    }
    
    // Output Transcription (Model)
    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      if (text) {
        currentOutputTransRef.current += text;
        setStreamingModelText(currentOutputTransRef.current); 
      }
    }

    // Turn Complete (Finalize)
    if (message.serverContent?.turnComplete) {
      const userInput = currentInputTransRef.current.trim();
      const modelOutput = currentOutputTransRef.current.trim();

      // Determine likely output language based on Input
      // Default to empty string if undefined to avoid crash
      const detectedInputLang = currentInputLanguageRef.current || '';
      const isFrenchInput = detectedInputLang.toLowerCase().startsWith('fr');
      
      // If input was French, we must speak in Target/Client language. 
      // If input was Foreign, we must speak in French.
      const isFrenchOutput = !isFrenchInput; 

      if (userInput) {
        setTranscripts(prev => [...prev, {
          id: Date.now() + '-user',
          source: 'user',
          text: userInput,
          language: currentInputLanguageRef.current,
          isFinal: true,
          timestamp: new Date()
        }]);
        currentInputTransRef.current = '';
        currentInputLanguageRef.current = undefined;
        setStreamingUserText(''); 
      }

      if (modelOutput) {
        setTranscripts(prev => [...prev, {
          id: Date.now() + '-model',
          source: 'model',
          text: modelOutput,
          isFinal: true,
          timestamp: new Date()
        }]);
        
        // Trigger Browser TTS if enabled (check Ref for latest state)
        if (useBrowserTTSRef.current) {
          speakText(modelOutput, isFrenchOutput);
        }

        currentOutputTransRef.current = '';
        setStreamingModelText(''); 
      }
    }
  };

  const disconnect = async () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (inputContextRef.current) {
      await inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (sessionPromiseRef.current) {
      sessionPromiseRef.current = null;
    }
    
    setIsConnected(false);
    setAudioLevel(0);
    
    // Reset refs and state
    currentInputTransRef.current = '';
    currentOutputTransRef.current = '';
    currentInputLanguageRef.current = undefined;
    setStreamingUserText('');
    setStreamingModelText('');
    
    nextStartTimeRef.current = 0;
    sourcesRef.current.clear();
    
    if (useBrowserTTSRef.current) window.speechSynthesis.cancel();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-indigo-200 shadow-lg">
            <Globe size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Interprète Universel</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Service Client Live</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isConnected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            <Wifi size={16} />
            {isConnected ? 'Connecté' : 'Déconnecté'}
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden max-w-5xl mx-auto w-full">
        <div className="flex-1 flex flex-col relative bg-white/50 backdrop-blur-sm border-x border-slate-200 shadow-sm mx-4 my-4 rounded-2xl overflow-hidden">
          
          {/* Transcript View */}
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-transparent opacity-50 pointer-events-none z-10 h-12" />
            <Transcript 
              items={transcripts} 
              streamingUserText={streamingUserText}
              streamingModelText={streamingModelText}
              streamingUserLanguage={currentInputLanguageRef.current}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-10 h-20" />
          </div>

          {/* Floating Controls / Status */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-4 w-full px-6">
            
            {/* Visualizer (Only visible when connected) */}
            <div className={`transition-opacity duration-500 ${isConnected ? 'opacity-100' : 'opacity-0'}`}>
               <Visualizer isActive={isConnected} audioLevel={audioLevel} />
            </div>

            {/* Main Action Bar */}
            <div className="flex items-center gap-3 bg-white p-2 rounded-full shadow-xl border border-slate-100">
              
              {/* Replay Button */}
              <button
                onClick={replayLastOutput}
                className="p-4 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-all duration-200"
                title="Répéter la dernière traduction"
              >
                <RotateCcw size={24} />
              </button>

              {/* Output Mute Toggle */}
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-all duration-200 ${
                  isOutputMuted 
                    ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' 
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
                title={isOutputMuted ? "Activer le son" : "Couper le son"}
              >
                {isOutputMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>

              {/* Connect / Disconnect Button */}
               <button
                onClick={isConnected ? disconnect : connectToGemini}
                className={`flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg ${
                  isConnected 
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                {isConnected ? (
                  <>
                    <MicOff size={24} />
                    <span>Arrêter</span>
                  </>
                ) : (
                  <>
                    <Mic size={24} />
                    <span>Démarrer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        targetLanguage={targetLanguage}
        onLanguageChange={setTargetLanguage}
        useBrowserTTS={useBrowserTTS}
        onTTSChange={setUseBrowserTTS}
      />

      {/* Error Toast */}
      {error && (
        <div className="fixed top-20 right-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg flex items-start gap-3 max-w-sm z-50 animate-bounce-in">
          <AlertCircle className="flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-sm">Erreur</p>
            <p className="text-sm opacity-90">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-700">
             &times;
          </button>
        </div>
      )}

      {/* Footer Info */}
      <footer className="py-4 text-center text-slate-400 text-xs">
        <p>Propulsé par Gemini Multimodal Live API • Latence ultra-faible • Traduction neuronale</p>
      </footer>
    </div>
  );
};

export default App;
import React, { useEffect, useRef } from 'react';
import { TranscriptItem } from '../types';
import { User, Sparkles, Volume2 } from 'lucide-react';

interface TranscriptProps {
  items: TranscriptItem[];
  streamingUserText?: string;
  streamingModelText?: string;
  streamingUserLanguage?: string;
}

const Transcript: React.FC<TranscriptProps> = ({ 
  items, 
  streamingUserText, 
  streamingModelText,
  streamingUserLanguage 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Combine history with real-time streaming items
  const displayItems = [...items];

  if (streamingUserText) {
    displayItems.push({
      id: 'streaming-user',
      source: 'user',
      text: streamingUserText,
      language: streamingUserLanguage,
      isFinal: false,
      timestamp: new Date()
    });
  }

  if (streamingModelText) {
    displayItems.push({
      id: 'streaming-model',
      source: 'model',
      text: streamingModelText,
      isFinal: false,
      timestamp: new Date()
    });
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayItems.length, streamingUserText, streamingModelText]);

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
        <Sparkles className="w-12 h-12 mb-4 text-indigo-200" />
        <p className="text-lg font-medium">Prêt à interpréter</p>
        <p className="text-sm mt-2">La conversation apparaîtra ici en temps réel.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full scroll-smooth" ref={scrollRef}>
      {displayItems.map((item) => (
        <div
          key={item.id}
          className={`flex gap-4 ${
            item.source === 'user' ? 'flex-row' : 'flex-row-reverse'
          }`}
        >
          {/* Avatar */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
            item.source === 'user' ? 'bg-white text-slate-600 border border-slate-200' : 'bg-indigo-600 text-white'
          }`}>
            {item.source === 'user' ? <User size={20} /> : <Sparkles size={20} />}
          </div>

          {/* Message Bubble */}
          <div className={`flex flex-col max-w-[80%] ${item.source === 'user' ? 'items-start' : 'items-end'}`}>
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-xs text-slate-400">
                {item.source === 'user' ? 'Source' : 'Interprète'} • {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              {item.language && (
                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border border-slate-200">
                  {item.language.split('-')[0]}
                </span>
              )}
            </div>
            <div className="group relative">
              <div
                className={`px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  item.source === 'user'
                    ? 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                    : 'bg-indigo-600 text-white rounded-tr-none'
                } ${!item.isFinal ? 'opacity-70' : ''}`}
              >
                {item.text}
                {!item.isFinal && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full ml-1 animate-pulse" />}
              </div>
              
              {/* Replay/Speak Button for Model Messages */}
              {item.source === 'model' && item.isFinal && (
                <button 
                  onClick={() => handleSpeak(item.text)}
                  className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
                  title="Lire à haute voix"
                >
                  <Volume2 size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Transcript;
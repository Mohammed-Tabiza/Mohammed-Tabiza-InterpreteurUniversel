import React from 'react';
import { X, Check, Mic2, Languages, Speech, Settings } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  targetLanguage: string;
  onLanguageChange: (lang: string) => void;
  useBrowserTTS: boolean;
  onTTSChange: (enabled: boolean) => void;
}

const VOICES = [
  { name: 'Kore', label: 'Kore', desc: 'Calme et posé (Défaut)' },
  { name: 'Puck', label: 'Puck', desc: 'Dynamique et joueur' },
  { name: 'Charon', label: 'Charon', desc: 'Profond et autoritaire' },
  { name: 'Fenrir', label: 'Fenrir', desc: 'Professionnel et direct' },
  { name: 'Zephyr', label: 'Zephyr', desc: 'Doux et empathique' },
];

const LANGUAGES = [
  { code: 'Auto', label: 'Universel (Multilingue)', flag: '🌐' },
  { code: 'English', label: 'Anglais', flag: '🇬🇧' },
  { code: 'French', label: 'Français', flag: '🇫🇷' },
  { code: 'Spanish', label: 'Espagnol', flag: '🇪🇸' },
  { code: 'German', label: 'Allemand', flag: '🇩🇪' },
  { code: 'Italian', label: 'Italien', flag: '🇮🇹' },
  { code: 'Chinese', label: 'Chinois', flag: '🇨🇳' },
  { code: 'Japanese', label: 'Japonais', flag: '🇯🇵' },
  { code: 'Arabic', label: 'Arabe', flag: '🇸🇦' },
  { code: 'Russian', label: 'Russe', flag: '🇷🇺' },
  { code: 'Portuguese', label: 'Portugais', flag: '🇵🇹' },
  { code: 'Dutch', label: 'Néerlandais', flag: '🇳🇱' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedVoice, 
  onVoiceChange,
  targetLanguage,
  onLanguageChange,
  useBrowserTTS,
  onTTSChange
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden ring-1 ring-slate-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
              <Settings size={20} />
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Configuration de l'Interprète</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* TTS Toggle Section */}
          <section className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded-lg text-indigo-600 border border-indigo-100 shadow-sm">
                    <Speech size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">Synthèse vocale du navigateur (TTS)</p>
                    <p className="text-xs text-slate-500 mt-0.5">Utiliser la voix du système au lieu de l'audio IA (Réduit la bande passante)</p>
                  </div>
                </div>
                <button 
                  onClick={() => onTTSChange(!useBrowserTTS)}
                  className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${useBrowserTTS ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${useBrowserTTS ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>
          </section>

          {/* Language Section */}
          <section>
             <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              <Languages size={14} />
              Langue du Client (Cible)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => onLanguageChange(lang.code)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                    targetLanguage === lang.code
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="font-medium text-sm">{lang.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Voice Section (Disabled if TTS is On) */}
          <section className={`transition-opacity duration-200 ${useBrowserTTS ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              <Mic2 size={14} />
              Voix de l'IA (Gemini)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VOICES.map((voice) => (
                <button
                  key={voice.name}
                  onClick={() => onVoiceChange(voice.name)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 group ${
                    selectedVoice === voice.name
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-indigo-100 shadow-sm'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`font-medium text-sm ${selectedVoice === voice.name ? 'text-indigo-900' : 'text-slate-900'}`}>
                      {voice.label}
                    </span>
                    <span className="text-xs text-slate-500 group-hover:text-indigo-600/70 transition-colors">
                      {voice.desc}
                    </span>
                  </div>
                  
                  {selectedVoice === voice.name && (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
        
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end flex-shrink-0">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm hover:shadow active:scale-95 duration-150"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
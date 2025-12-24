
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, CheckCircle, Music, ArrowLeft, Send, AlertCircle, Loader2, PenTool, PlayCircle, Lock, Timer, Compass, Map as MapIcon, Book, Info, Search, ExternalLink, Trophy, Unlock, Sparkles, ScrollText, LogOut } from 'lucide-react';
import { songData, islands } from './data';
import { GoogleGenAI } from "@google/genai";

const GOOGLE_SCRIPT_URL: string = "https://script.google.com/macros/s/AKfycbzm66QNefp7MaPBG3ApPiBP6MuYyc8nC7KKhLcAQCJHZFELB_qoWVvuaVVIpooCsQwTYg/exec";
const STORAGE_BASE_KEY = "jay_chou_v1_";

const songEmojis: Record<string, string> = {
  '東風破': '🎻', '青花瓷': '🏺', '髮如雪': '❄️', '菊花台': '🌼', '煙花易冷': '🎆', '霍元甲': '🥋', '本草綱目': '🌿',
  '雙截棍': '🥢', '以父之名': '教堂', '忍者': '🥷', '半獸人': '🐺', '紅模仿': '💃',
  '夜曲': '🎹', '琴傷': '🎼', '逆鱗': '🐲', '迷迭香': '🌿', '土耳其冰淇淋': '🍦',
  '止戰之殤': '🕊️', '梯田': '🌾', '懦夫': '🚫', '爸，我回來了': '🏠', '超人不會飛': '🦸',
  '晴天': '☀️', '安靜': '🤫', '擱淺': '⚓', '不能說的秘密': '🤫', '說好的幸福呢': '💔', '告白氣球': '🎈',
  '簡單愛': '❤️', '牛仔很忙': '🤠', '聽媽媽的話': '👩', '爺爺泡的茶': '🍵', '稻香': '🌾', '水手怕水': '⚓', '魔術先生': '🎩', '喬克叔叔': '🤡'
};

interface Student {
  className: string;
  seatNumber: string;
  name: string;
}

interface StructuredNoteInputProps {
  template: string;
  savedValues: Record<string, string>;
  onUpdate: (newValues: Record<string, string>, fullText: string) => void;
  disabled: boolean;
  accentColor: string;
}

const StructuredNoteInput: React.FC<StructuredNoteInputProps> = ({ template, savedValues, onUpdate, disabled, accentColor }) => {
  const parts = useMemo(() => template.split(/(【.*?】)/g), [template]);

  const handleChange = (key: string, value: string) => {
    const newValues = { ...savedValues, [key]: value };
    let fullText = "";
    parts.forEach((part, index) => {
      if (part.startsWith('【') && part.endsWith('】')) {
        const val = newValues[`field_${index}`] || "";
        fullText += val ? ` ${val} ` : part; 
      } else {
        fullText += part;
      }
    });
    onUpdate(newValues, fullText);
  };

  return (
    <div className="text-gray-800 leading-8 text-xl md:text-2xl font-lxgw-reg tracking-wide">
      {parts.map((part, index) => {
        if (part.startsWith('【') && part.endsWith('】')) {
          const placeholder = part.slice(1, -1);
          const fieldKey = `field_${index}`;
          const estimatedWidth = Math.max(120, placeholder.length * 24);
          return (
            <span key={index} className="inline-block mx-1 align-middle" style={{ width: `${estimatedWidth}px`, maxWidth: '100%' }}>
              <textarea
                value={savedValues[fieldKey] || ''}
                onChange={(e) => handleChange(fieldKey, e.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                rows={1}
                className="w-full px-2 py-0 bg-white/10 border-b-2 font-bold focus:outline-none placeholder-gray-400 text-center resize-none h-[2.5rem] transition-all"
                style={{ borderColor: accentColor, color: accentColor }}
              />
            </span>
          );
        } else {
          return <span key={index}>{part}</span>;
        }
      })}
    </div>
  );
};

const App = () => {
  const [studentInfo, setStudentInfo] = useState<Student | null>(null);
  const [tempStudentInput, setTempStudentInput] = useState({ className: '', seatNumber: '', name: '' });
  const [activeIsland, setActiveIsland] = useState<typeof islands[0] | null>(null);
  const [selectedSong, setSelectedSong] = useState<string | null>(null);
  const [completedIslands, setCompletedIslands] = useState<number[]>([]);
  const [imageError, setImageError] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ title: string; message: string; aiFeedback?: string; type: 'success' | 'warning' } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  
  const [songProgress, setSongProgress] = useState<Record<string, { 
    answer: string; 
    note: string; 
    isSubmitted: boolean;
    isListeningFinished: boolean; 
    noteInputValues: Record<string, string>;
    unlockEndTime: number | null; 
    timer: number; 
  }>>({});

  useEffect(() => {
    const lastStudent = localStorage.getItem('jay_chou_last_student');
    if (lastStudent) {
      try {
        const parsed = JSON.parse(lastStudent);
        setStudentInfo(parsed);
        loadStudentProgress(parsed);
      } catch (e) {
        console.error("Fail to load student info");
      }
    }
  }, []);

  useEffect(() => {
    if (studentInfo) {
      const studentKey = `${STORAGE_BASE_KEY}${studentInfo.className}_${studentInfo.seatNumber}_${studentInfo.name}`;
      const dataToSave = {
        songProgress,
        completedIslands
      };
      localStorage.setItem(studentKey, JSON.stringify(dataToSave));
      localStorage.setItem('jay_chou_last_student', JSON.stringify(studentInfo));
    }
  }, [songProgress, completedIslands, studentInfo]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSongProgress(prev => {
        const now = Date.now();
        const next = { ...prev };
        let hasChanged = false;

        Object.keys(next).forEach(song => {
          const prog = next[song];
          if (prog.unlockEndTime && !prog.isSubmitted) {
            const diff = Math.ceil((prog.unlockEndTime - now) / 1000);
            
            if (diff <= 0) {
              if (prog.timer !== 0 || !prog.isListeningFinished) {
                next[song] = { ...prog, timer: 0, isListeningFinished: true, unlockEndTime: null };
                hasChanged = true;
              }
            } else {
              if (prog.timer !== diff) {
                next[song] = { ...prog, timer: diff };
                hasChanged = true;
              }
            }
          }
        });

        return hasChanged ? next : prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const loadStudentProgress = (student: Student) => {
    const studentKey = `${STORAGE_BASE_KEY}${student.className}_${student.seatNumber}_${student.name}`;
    const savedData = localStorage.getItem(studentKey);
    if (savedData) {
      try {
        const { songProgress: sp, completedIslands: ci } = JSON.parse(savedData);
        setSongProgress(sp || {});
        setCompletedIslands(ci || []);
      } catch (e) {
        console.error("Fail to parse progress data");
      }
    } else {
        setSongProgress({});
        setCompletedIslands([]);
    }
  };

  const handleLogin = () => {
    if (!tempStudentInput.className.trim() || !tempStudentInput.seatNumber.trim() || !tempStudentInput.name.trim()) {
      setValidationError("⚠️ 紀錄需完整：班級、座號與姓名");
      return;
    }
    const student = { ...tempStudentInput };
    setStudentInfo(student);
    loadStudentProgress(student);
    setValidationError(null);
  };

  const handleLogout = () => {
    setStudentInfo(null);
    localStorage.removeItem('jay_chou_last_student');
    setSongProgress({});
    setCompletedIslands([]);
  };

  const handleIslandClick = (island: typeof islands[0]) => {
    setActiveIsland(island);
    setSelectedSong(null);
    setSubmitWarning(null);
  };

  const handleSongClick = (songName: string) => {
    if (songData[songName]) {
      setSelectedSong(songName);
      setValidationError(null);
      setSubmitWarning(null);
      if (!songProgress[songName]) {
        setSongProgress(prev => ({
          ...prev,
          [songName]: { 
            answer: '', 
            note: songData[songName].responseFormat || '', 
            noteInputValues: {}, 
            isSubmitted: false, 
            isListeningFinished: false,
            unlockEndTime: null,
            timer: 0
          }
        }));
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const validateNoteBlanks = (songName: string) => {
    const current = songProgress[songName];
    if (!current) return false;
    const template = songData[songName].responseFormat;
    if (!template) return current.note.trim() !== '';

    const parts = template.split(/(【.*?】)/g);
    return parts.every((part, index) => {
      if (part.startsWith('【') && part.endsWith('】')) {
        const val = current.noteInputValues[`field_${index}`];
        return val && val.trim() !== '';
      }
      return true;
    });
  };

  const closeModal = () => {
    setActiveIsland(null);
    setSelectedSong(null);
  };

  const handlePlayAndUnlock = () => {
    if (selectedSong) {
      const current = songProgress[selectedSong];
      if (current.isListeningFinished || current.isSubmitted) {
        window.open(songData[selectedSong].url, '_blank');
        return;
      }
      if (current.unlockEndTime) {
        window.open(songData[selectedSong].url, '_blank');
        return;
      }
      
      const otherSongInTimer = Object.entries(songProgress).find(([name, prog]) => name !== selectedSong && (prog as any).unlockEndTime);
      if (otherSongInTimer) {
        setAlertInfo({
          title: "⚠️ 專注力檢測",
          message: `已有其他樂章《${otherSongInTimer[0]}》正在解封中。\n請先專心完成該首歌曲的聆聽與探索，再進行下一首。`,
          type: 'warning'
        });
        return;
      }
      window.open(songData[selectedSong].url, '_blank');
      
      const duration = 150; 
      setSongProgress(prev => ({
        ...prev,
        [selectedSong]: { 
          ...prev[selectedSong], 
          unlockEndTime: Date.now() + duration * 1000,
          timer: duration
        }
      }));
    }
  };

  const generateAIFeedback = async (songName: string, noteText: string): Promise<string> => {
    try {
      if (!process.env.API_KEY) throw new Error("API Key is missing");
      setIsAiLoading(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `一位航行者在《${songName}》的島嶼留下這段感悟：『${noteText}』。`,
        config: {
          systemInstruction: "你是『周杰倫音樂寶藏地圖』的航行守護者。請針對學生的感悟給予一段 80 字以內的「靈感迴聲」。語氣要詩意、正向且像個智者。最後必須以句號(。)結尾。絕對禁止使用 Emoji。",
          maxOutputTokens: 1000,
          thinkingConfig: { thinkingBudget: 500 },
        },
      });
      const text = response.text;
      if (!text) throw new Error("Empty AI response");
      return text.trim();
    } catch (error) {
      console.error("AI Generation Error:", error);
      return "你的感悟已被記錄在星圖之中，這段航程因你的思考而閃耀。繼續前進吧，探險員！";
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRealSubmit = async () => {
    if (!selectedSong || !activeIsland || !studentInfo) return;
    setIsSubmitting(true);
    const currentProgress = songProgress[selectedSong];
    const correctAns = songData[selectedSong]?.correctAnswer;
    const isAnswerCorrect = currentProgress.answer?.trim() === correctAns?.trim();
    
    const aiResponse = await generateAIFeedback(selectedSong, currentProgress.note);

    const params = new URLSearchParams();
    params.append('className', studentInfo.className);
    params.append('seatNumber', studentInfo.seatNumber);
    params.append('name', studentInfo.name);
    params.append('island', activeIsland.name);
    params.append('song', selectedSong);
    params.append('answer', currentProgress.answer);
    params.append('isCorrect', isAnswerCorrect ? "答對" : "答錯"); 
    params.append('note', currentProgress.note);
    params.append('timestamp', new Date().toISOString());

    try {
        await fetch(GOOGLE_SCRIPT_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
        setShowConfirm(false);
        const updatedProgress = { ...songProgress, [selectedSong]: { ...currentProgress, isSubmitted: true, unlockEndTime: null, timer: 0 } };
        setSongProgress(updatedProgress);

        const completedInThisIsland = activeIsland.songs.filter(s => updatedProgress[s]?.isSubmitted).length;
        if (completedInThisIsland >= 2 && !completedIslands.includes(activeIsland.id)) {
            setCompletedIslands(prev => [...prev, activeIsland.id]);
            setAlertInfo({ 
              title: "🏆 島嶼制霸！", 
              message: `征服了「${activeIsland.name}」！`, 
              aiFeedback: aiResponse,
              type: 'success' 
            });
        } else {
            setAlertInfo({ 
              title: isAnswerCorrect ? "🏅 完美的觀察！" : "🧗 再次探索吧！", 
              message: isAnswerCorrect ? "鎖定線索，紀錄已封存。" : `真相其實是：「${correctAns}」。`, 
              aiFeedback: aiResponse,
              type: isAnswerCorrect ? 'success' : 'warning' 
            });
        }
    } catch (e) {
        setShowConfirm(false);
        setAlertInfo({ title: "⚠️ 傳送失敗", message: "請檢查網路法陣。", type: 'warning' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const mapImageUrl = "https://drive.google.com/thumbnail?id=1N67L-xxy99CraTknq_tGbgg8WrGZZtAV&sz=w1920";

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center py-4 md:py-10 font-lxgw-reg">
      {!studentInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#fef9e7] shadow-2xl p-6 md:p-10 max-w-md w-full border-8 border-[#5d2e0a] rounded-3xl parchment-shadow">
            <div className="text-center mb-6">
              <Compass size={48} className="text-[#8b4513] mx-auto mb-4" />
              <h2 className="text-4xl font-lxgw-bold text-[#5d2e0a]">探險家航行日誌</h2>
            </div>
            <div className="space-y-4 font-lxgw-bold w-full">
              <input type="text" placeholder="船隊 (班級)" value={tempStudentInput.className} onChange={(e) => setTempStudentInput({...tempStudentInput, className: e.target.value})} className="w-full p-3 border-b-4 border-[#8b4513]/40 bg-transparent text-xl font-bold focus:border-[#8b4513] outline-none" />
              <div className="flex gap-4 w-full">
                <input type="number" placeholder="座號" value={tempStudentInput.seatNumber} onChange={(e) => setTempStudentInput({...tempStudentInput, seatNumber: e.target.value})} className="w-24 shrink-0 p-3 px-1 border-b-4 border-[#8b4513]/40 bg-transparent text-xl font-bold outline-none" />
                <input type="text" placeholder="探險員姓名" value={tempStudentInput.name} onChange={(e) => setTempStudentInput({...tempStudentInput, name: e.target.value})} className="flex-1 min-w-0 p-3 px-1 border-b-4 border-[#8b4513]/40 bg-transparent text-xl font-bold outline-none" />
              </div>
              {validationError && <p className="text-red-700 font-bold text-center">{validationError}</p>}
              <button onClick={handleLogin} className="w-full bg-[#5d2e0a] text-[#fef9e7] font-lxgw-bold py-4 text-2xl tracking-widest hover:bg-black transition-all rounded-2xl shadow-lg">解開地圖封印</button>
            </div>
          </div>
        </div>
      )}

      <div className="map-outer-wrapper px-2 md:px-0">
        <div className="map-container map-border bg-[#d0e6f0] parchment-shadow rounded-2xl md:rounded-3xl overflow-hidden">
          {!imageError ? (
            <img src={mapImageUrl} className="map-image select-none pointer-events-none" onError={() => setImageError(true)} />
          ) : (
            <div className="w-full h-96 flex items-center justify-center text-gray-400 font-lxgw-bold">地圖載入中...</div>
          )}
          {islands.map((island) => (
            <div key={island.id} onClick={() => handleIslandClick(island)} className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10" style={{ top: island.top, left: island.left, width: island.width, height: island.height }}>
              <div className="w-full h-full rounded-full transition-all hover:bg-white/10 flex items-center justify-center">
                {completedIslands.includes(island.id) && <CheckCircle className="text-amber-500 w-2/3 h-2/3 drop-shadow-2xl animate-bounce" />}
              </div>
            </div>
          ))}
          {studentInfo && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-3 px-6 py-2 bg-[#fef9e7]/95 border-2 border-[#5d2e0a] shadow-2xl text-xs md:text-lg font-lxgw-bold text-[#5d2e0a] whitespace-nowrap rounded-full">
              <span className="flex items-center gap-1"><MapIcon size={20}/> 進度: {completedIslands.length}/6</span>
              <span className="border-l-2 border-[#5d2e0a]/30 pl-3">🚢 {studentInfo.className} 隊 | #{studentInfo.seatNumber} {studentInfo.name}</span>
              <button onClick={handleLogout} className="ml-2 hover:text-red-600 transition-colors"><LogOut size={18}/></button>
            </div>
          )}
        </div>
      </div>

      {activeIsland && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#fef9e7] shadow-2xl w-full max-w-4xl border-4 md:border-8 border-[#5d2e0a] max-h-[96vh] flex flex-col parchment-shadow rounded-3xl md:rounded-[2.5rem] overflow-hidden font-lxgw-reg">
            <div className={`p-4 md:p-6 ${activeIsland.color} text-white flex justify-between items-center shrink-0 shadow-lg`}>
              <div className="flex items-center gap-3">
                {selectedSong ? <button onClick={() => setSelectedSong(null)} className="p-2 hover:bg-black/20 rounded-full transition-all"><ArrowLeft size={28}/></button> : <div className="p-1">{activeIsland.icon}</div>}
                <h2 className="text-2xl md:text-4xl font-lxgw-bold truncate tracking-widest">{selectedSong ? `《${selectedSong}》` : activeIsland.name}</h2>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-black/20 rounded-full transition-all"><X size={32}/></button>
            </div>

            <div className="p-5 md:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 pb-16">
              {!selectedSong ? (
                <>
                  <div className="bg-white/40 p-6 rounded-[2rem] border-2 border-dashed border-[#5d2e0a]/20 shadow-inner flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <p className="text-lg md:text-2xl text-gray-800 font-lxgw-reg leading-relaxed tracking-wide whitespace-pre-line flex-1">「{activeIsland.content}」</p>
                    <div className="shrink-0 px-6 py-3 bg-[#5d2e0a]/10 border-2 border-[#5d2e0a]/20 rounded-2xl text-center min-w-[140px] shadow-sm">
                        <div className="text-xl md:text-2xl font-lxgw-bold text-[#5d2e0a]/80 uppercase tracking-widest mb-0.5">探索進度</div>
                        <div className="text-3xl md:text-4xl font-black text-[#5d2e0a] flex items-center justify-center gap-2 font-lxgw-bold">
                           <Trophy size={30} className={activeIsland.songs.filter(s => songProgress[s]?.isSubmitted).length >= 2 ? 'text-amber-500 animate-pulse' : 'text-gray-400'}/>
                           {activeIsland.songs.filter(s => songProgress[s]?.isSubmitted).length} / 2
                        </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-[#5d2e0a] font-lxgw-bold text-2xl flex items-center gap-2 px-4 tracking-widest"><Music size={28} className={activeIsland.textColor}/> 島嶼秘藏歌單</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeIsland.songs.map((song, idx) => {
                        const isDone = songProgress[song]?.isSubmitted;
                        const hasData = songData[song];
                        const emoji = songEmojis[song] || '🎵';
                        return (
                          <button key={idx} onClick={() => handleSongClick(song)} disabled={!hasData}
                            className={`px-4 py-4 rounded-2xl text-xl md:text-2xl font-lxgw-bold border-2 transition-all flex items-center justify-between gap-3 text-left shadow-sm min-h-[4.5rem] ${hasData ? isDone ? 'bg-green-100 text-green-900 border-green-700/30' : 'bg-white/80 text-[#5d2e0a] border-[#5d2e0a]/10 hover:border-[#5d2e0a] hover:bg-white hover:shadow-lg active:scale-95' : 'bg-gray-100 text-gray-400 border-gray-200 opacity-50'}`}
                          >
                            <span className="flex items-center gap-3 overflow-hidden">
                                <span className="text-2xl shrink-0">{emoji}</span>
                                <span className="leading-tight">{song}</span>
                            </span>
                            {isDone && <CheckCircle size={18} className="shrink-0 text-green-700"/>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="bg-white/50 p-6 rounded-[2.5rem] border-l-[12px] shadow-lg relative" style={{ borderColor: activeIsland.textColor.replace('text-', '') }}>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className={`font-lxgw-bold text-2xl md:text-3xl flex items-center gap-3 ${activeIsland.textColor} tracking-widest`}><Info size={32}/> 景點情報</h3>
                      {songData[selectedSong].lyricUrl && (
                        <a href={songData[selectedSong].lyricUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-lxgw-bold transition-colors">
                          <ExternalLink size={20}/> 歌詞連結
                        </a>
                      )}
                    </div>
                    <p className="text-lg md:text-2xl text-gray-800 font-lxgw-reg leading-relaxed">{songData[selectedSong].info}</p>
                    <div className="mt-8 pt-6 border-t-2 border-[#5d2e0a]/10">
                        <button onClick={handlePlayAndUnlock} className={`w-full flex items-center justify-center gap-4 text-white font-lxgw-bold py-6 rounded-2xl text-2xl shadow-2xl hover:scale-[1.01] transition-all tracking-widest ${activeIsland.color}`}>
                            {songProgress[selectedSong].unlockEndTime ? <Loader2 className="animate-spin" size={36}/> : (songProgress[selectedSong].isListeningFinished || songProgress[selectedSong].isSubmitted ? <CheckCircle size={36}/> : <PlayCircle size={36}/>)} 
                            {songProgress[selectedSong].unlockEndTime ? `奏鳴中 ${formatTime(songProgress[selectedSong].timer)}` : (songProgress[selectedSong].isListeningFinished || songProgress[selectedSong].isSubmitted ? '重新聆聽樂章' : '啟動樂章')}
                        </button>
                    </div>
                  </div>

                  <div className="space-y-8 pb-10">
                    {songProgress[selectedSong].unlockEndTime ? (
                      <div className="bg-[#5d2e0a]/5 border-4 border-dashed border-[#5d2e0a]/20 p-10 rounded-[3rem] text-center space-y-6 animate-pulse">
                        <Lock size={80} className="text-[#5d2e0a]/40 mx-auto" />
                        <h4 className="text-3xl font-lxgw-bold text-[#5d2e0a]">樂章封印中</h4>
                        <p className="text-xl md:text-2xl text-[#5d2e0a]/60 font-lxgw-reg">「請放下筆，專心聆聽這段旋律...」</p>
                      </div>
                    ) : (songProgress[selectedSong].isListeningFinished || songProgress[selectedSong].isSubmitted) ? (
                      <div className="animate-in slide-in-from-bottom-10 duration-700 space-y-8">
                        <div className="bg-white/40 p-6 border-l-8 border-[#5d2e0a] shadow-md rounded-r-[2rem]">
                          <h3 className="text-[#5d2e0a] font-lxgw-bold text-2xl md:text-3xl mb-4 flex items-center gap-3 tracking-widest"><Search size={32} className={activeIsland.textColor}/> 線索搜查</h3>
                          <p className="text-xl md:text-2xl text-gray-800 font-lxgw-bold mb-6">「{songData[selectedSong].quiz.question}」</p>
                          <div className="grid gap-3">
                            {songData[selectedSong].quiz.options.map((opt, i) => (
                              <label key={i} className={`flex items-center gap-4 p-5 cursor-pointer border-2 rounded-2xl transition-all ${songProgress[selectedSong].answer === opt ? 'bg-white border-[#5d2e0a] shadow-xl scale-[1.01]' : 'bg-white/40 border-transparent hover:bg-white/70'}`}>
                                <input type="radio" checked={songProgress[selectedSong].answer === opt} onChange={() => {
                                    if(!songProgress[selectedSong].isSubmitted) setSongProgress(p => ({...p, [selectedSong]: {...p[selectedSong], answer: opt}}));
                                }} disabled={songProgress[selectedSong].isSubmitted} className="w-8 h-8 text-[#5d2e0a]" />
                                <span className="text-xl md:text-2xl font-lxgw-bold">{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white/40 p-6 border-r-8 border-[#5d2e0a] shadow-md rounded-l-[2rem]">
                          <h3 className="text-[#5d2e0a] font-lxgw-bold text-2xl md:text-3xl mb-4 flex items-center gap-3 tracking-widest"><Book size={32} className={activeIsland.textColor}/> 航行筆記</h3>
                          {songData[selectedSong].responseFormat ? (
                               <div className="bg-white/60 p-6 border-2 border-[#5d2e0a]/10 rounded-2xl shadow-inner">
                                   <StructuredNoteInput template={songData[selectedSong].responseFormat || ''} savedValues={songProgress[selectedSong].noteInputValues || {}} onUpdate={(vals, full) => {
                                       if(!songProgress[selectedSong].isSubmitted) setSongProgress(p => ({...p, [selectedSong]: {...p[selectedSong], noteInputValues: vals, note: full}}));
                                   }} disabled={songProgress[selectedSong].isSubmitted} accentColor={activeIsland.textColor.replace('text-', '')} />
                               </div>
                          ) : (
                               <textarea value={songProgress[selectedSong].note} onChange={(e) => {
                                   if(!songProgress[selectedSong].isSubmitted) setSongProgress(p => ({...p, [selectedSong]: {...p[selectedSong], note: e.target.value}}));
                               }} disabled={songProgress[selectedSong].isSubmitted} className="w-full p-6 bg-transparent border-b-4 border-[#5d2e0a]/10 focus:border-[#5d2e0a] outline-none min-h-[140px] text-xl md:text-2xl font-lxgw-reg font-bold resize-none" />
                          )}
                        </div>
                        
                        {!songProgress[selectedSong].isSubmitted && (
                          <div className="flex flex-col gap-4 font-lxgw-bold">
                            {submitWarning && (
                                <div className="bg-red-50 border-l-8 border-red-600 p-6 rounded-xl flex items-center gap-4 animate-bounce shadow-lg">
                                    <AlertCircle className="text-red-600" size={32}/>
                                    <p className="text-red-800 font-bold text-xl md:text-2xl">{submitWarning}</p>
                                </div>
                            )}
                            <button onClick={() => {
                                if (!songProgress[selectedSong].answer) return setSubmitWarning("🔍 尚未搜查到線索回答喔！");
                                if (!validateNoteBlanks(selectedSong)) return setSubmitWarning("✍️ 航行筆記尚未完成喔！");
                                setSubmitWarning(null);
                                setShowConfirm(true);
                            }} disabled={isSubmitting} className="w-full bg-[#5d2e0a] text-white font-lxgw-bold py-6 rounded-2xl text-3xl tracking-[0.3em] hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-3">
                                {isSubmitting ? <Loader2 className="animate-spin" size={32}/> : <Send size={32}/>} 送出探索紀錄
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-[#5d2e0a]/5 border-2 border-[#5d2e0a]/10 p-12 rounded-[2rem] text-center flex flex-col items-center gap-4">
                        <Unlock size={48} className="text-[#5d2e0a]/20" />
                        <p className="text-2xl font-lxgw-reg font-bold text-[#5d2e0a]/40">尚未啟動探索...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
          <div className="bg-[#fef9e7] p-8 max-w-sm w-full border-8 border-[#5d2e0a] parchment-shadow text-center rounded-[2.5rem]">
            <h3 className="text-3xl font-lxgw-bold text-[#5d2e0a] mb-4 tracking-widest">封存紀錄？</h3>
            <p className="text-lg font-lxgw-reg font-bold mb-6 text-gray-700">「提交後將不可再改。」</p>
            {(isSubmitting || isAiLoading) && (
              <div className="mb-4 flex flex-col items-center gap-2">
                <Loader2 className="animate-spin text-amber-600" size={32} />
                <p className="text-amber-700 font-lxgw-bold animate-pulse">守護者正在細品您的筆記...</p>
              </div>
            )}
            <div className="flex flex-col gap-3 font-lxgw-bold">
              <button onClick={handleRealSubmit} disabled={isSubmitting || isAiLoading} className="w-full py-4 bg-green-800 text-white font-bold text-xl rounded-2xl shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {(isSubmitting || isAiLoading) ? "處理中..." : "是的，封存！"}
              </button>
              <button onClick={() => setShowConfirm(false)} disabled={isSubmitting || isAiLoading} className="py-2 text-gray-400 font-bold text-lg disabled:opacity-30">再思索片刻</button>
            </div>
          </div>
        </div>
      )}

      {alertInfo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-md overflow-hidden font-lxgw-reg">
          <div className="bg-[#fef9e7] p-5 md:p-10 max-w-2xl w-full border-4 md:border-8 border-[#5d2e0a] parchment-shadow rounded-[2.5rem] md:rounded-[3rem] flex flex-col max-h-[95vh] overflow-hidden">
            <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 md:pr-2 space-y-6 md:space-y-8">
              <div className={`flex justify-center pt-4 ${alertInfo.type === 'success' ? 'text-green-800' : 'text-amber-800'}`}>
                {alertInfo.type === 'success' ? <CheckCircle size={56} className="md:w-20 md:h-20" /> : <AlertCircle size={56} className="md:w-20 md:h-20" />}
              </div>
              <h3 className="text-2xl md:text-4xl font-lxgw-bold text-[#5d2e0a] text-center tracking-widest px-2">{alertInfo.title}</h3>
              <p className="text-lg md:text-2xl font-lxgw-reg font-bold text-center text-gray-800 leading-relaxed px-2">{alertInfo.message}</p>
              
              {alertInfo.aiFeedback && (
                <div className="bg-white/70 border-2 border-amber-200 p-6 md:p-8 rounded-2xl md:rounded-3xl relative shadow-inner mb-6 min-h-[140px]">
                  <Sparkles className="absolute -top-3 -left-3 text-amber-500 fill-amber-500" size={28} />
                  <h4 className="text-amber-800 font-lxgw-bold text-lg md:text-2xl mb-4 flex items-center gap-2 tracking-widest"><ScrollText size={22}/> 航行日誌：靈感迴聲</h4>
                  <p className="text-xl md:text-2xl text-gray-700 font-lxgw-reg leading-relaxed md:leading-loose whitespace-pre-wrap break-words">
                    「{alertInfo.aiFeedback}」
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 pb-4">
              <button onClick={() => setAlertInfo(null)} className="w-full py-4 md:py-6 bg-[#5d2e0a] text-white font-lxgw-bold text-lg md:text-2xl rounded-2xl shadow-2xl tracking-widest hover:bg-black active:scale-[0.98] transition-all shrink-0">
                繼續航程
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

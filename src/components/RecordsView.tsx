import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Video, Plus, X, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';

export type RecordEntry = {
  id: string;
  date: string;
  type: 'image' | 'video';
  url: string;
  note: string;
  weekCount: number;
  dayCount: number;
};

interface RecordsViewProps {
  pregWeek: number;
  pregDay: number;
}

export default function RecordsView({ pregWeek, pregDay }: RecordsViewProps) {
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [note, setNote] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMediaFile(e.target.files[0]);
    }
  };

  const handleAddRecord = () => {
    if (!mediaFile && !note.trim()) return;

    const newRecord: RecordEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: mediaFile?.type.startsWith('video') ? 'video' : 'image',
      url: mediaFile ? URL.createObjectURL(mediaFile) : '',
      note: note.trim(),
      weekCount: pregWeek,
      dayCount: pregDay,
    };

    setRecords([newRecord, ...records]);
    setIsAdding(false);
    setMediaFile(null);
    setNote('');
  };

  const removeRecord = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">寶寶成長紀錄</h2>
              <p className="text-sm text-slate-500">上傳超音波照片、影片或生活點滴📝</p>
            </div>
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4" />
            <span>新增紀錄</span>
          </button>
        </div>

        {isAdding && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">今日紀錄 (第 {pregWeek} 週 {pregDay} 天)</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-4">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="寫下今天的感想或要對寶寶說的話..."
                className="w-full h-24 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
              />
              
              <div className="flex items-center gap-4">
                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition">
                  <ImageIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">上傳照片</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>

                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition">
                  <Video className="w-4 h-4" />
                  <span className="text-sm font-medium">上傳影片</span>
                  <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>

              {mediaFile && (
                <div className="relative inline-block mt-4">
                  {mediaFile.type.startsWith('video') ? (
                    <video src={URL.createObjectURL(mediaFile)} className="h-40 rounded-lg border border-slate-200 object-cover" controls />
                  ) : (
                    <img src={URL.createObjectURL(mediaFile)} alt="preview" className="h-40 rounded-lg border border-slate-200 object-cover" />
                  )}
                  <button 
                    onClick={() => setMediaFile(null)}
                    className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button 
                  onClick={handleAddRecord}
                  disabled={!mediaFile && !note.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {records.length === 0 && !isAdding ? (
            <div className="text-center py-12 text-slate-400">
              <Camera className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>目前還沒有任何紀錄，趕快點擊上方「新增紀錄」吧！</p>
            </div>
          ) : (
            records.map(record => (
              <div key={record.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-indigo-600 font-semibold mb-2 bg-indigo-50 inline-flex px-2 py-1 rounded-md">
                    <Calendar className="w-4 h-4" />
                    第 {record.weekCount} 週 {record.dayCount} 天
                    <span className="text-slate-400 font-normal ml-2">
                      {new Date(record.date).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {record.note && (
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed mt-2 mb-4">{record.note}</p>
                  )}

                  {record.url && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-slate-100 inline-block max-w-full">
                      {record.type === 'video' ? (
                        <video src={record.url} controls className="max-h-80 w-auto" />
                      ) : (
                        <img src={record.url} alt="Record" className="max-h-80 w-auto" />
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => removeRecord(record.id)} className="shrink-0 p-2 text-slate-300 hover:text-red-500 transition h-fit rounded-lg hover:bg-red-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

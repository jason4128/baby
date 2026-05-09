import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Baby, LogIn, UserPlus, AlertCircle } from 'lucide-react';

export default function LoginView() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '登入/註冊失敗，請確認您的帳號密碼。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F0] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-amber-50 w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl flex items-center justify-center border-2 border-amber-100/50 shadow-inner">
            <Baby className="w-8 h-8 text-amber-500" />
          </div>
        </div>

        <h1 className="text-2xl font-black text-center text-[#5C4D43] mb-2 tracking-tight">
          育產食譜顧問
        </h1>
        <p className="text-center text-amber-800/60 font-medium mb-8">
          {isLogin ? '登入以繼續使用您的專屬紀錄' : '建立帳號以同步您的食譜紀錄'}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-3 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-[#5C4D43] mb-1.5">電子郵件</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43] transition-all font-medium"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#5C4D43] mb-1.5">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#FFF9F0] border border-[#E8DCCB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[#5C4D43] transition-all font-medium"
              placeholder="請輸入密碼"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 active:scale-[0.98] text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-amber-900/10 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white inline-block"></span>
            ) : isLogin ? (
              <>
                <LogIn className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
                登入帳號
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
                註冊帳號
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-amber-50 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-amber-600 font-bold hover:text-amber-700 transition-colors text-sm"
          >
            {isLogin ? '還沒有帳號？立即註冊' : '已經有帳號了？返回登入'}
          </button>
        </div>
      </div>
    </div>
  );
}


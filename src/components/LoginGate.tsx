import React, { useState } from 'react';
import { Lock, Eye, EyeOff, HelpCircle, AlertCircle, ArrowRight } from 'lucide-react';

const AUTH_SESSION_KEY = 'dfm_vault_auth_date_v1';

export function getTodayKey(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function isDailySessionAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === getTodayKey();
  } catch {
    return false;
  }
}

export function clearDailySessionAuth(): void {
  try {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Validates whether the entered password matches "DV + 今日日期"
 * Supports standard formats of today's date (e.g., DV20261011, DV1011, DV2026-10-11, DV1151011)
 */
function verifyDailyPassword(input: string): boolean {
  const cleaned = input.trim().toUpperCase();
  if (!cleaned.startsWith('DV')) return false;

  const datePart = cleaned.slice(2).trim();
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const rocYyy = String(now.getFullYear() - 1911);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const m = String(now.getMonth() + 1);
  const dd = String(now.getDate()).padStart(2, '0');
  const d = String(now.getDate());

  const validDateTokens = new Set([
    `${yyyy}${mm}${dd}`, // YYYYMMDD (e.g. 20261011)
    `${yyyy}${m}${d}`, // YYYYM(M)D(D)
    `${mm}${dd}`, // MMDD (e.g. 1011)
    `${m}${d}`, // MD
    `${yyyy}-${mm}-${dd}`, // YYYY-MM-DD
    `${yyyy}/${mm}/${dd}`, // YYYY/MM/DD
    `${yyyy}.${mm}.${dd}`, // YYYY.MM.DD
    `${rocYyy}${mm}${dd}`, // ROC YYYMMDD (e.g. 1151011)
  ]);

  return validDateTokens.has(datePart);
}

interface LoginGateProps {
  onSuccess: () => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyDailyPassword(password)) {
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, getTodayKey());
      } catch {
        // ignore
      }
      setErrorMsg(null);
      onSuccess();
    } else {
      setErrorMsg('登錄密碼錯誤，請重新輸入。');
      setShowHint(true);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-900 select-none">
      {/* Subtle Engineering Grid Background */}
      <div
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="bg-slate-900 px-6 py-6 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                DFM案例資料庫工作台
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                系統安全驗證 · 請輸入授權登錄密碼以開啟工作台
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="dfm-login-password"
                className="block text-xs font-bold text-slate-800"
              >
                登錄密碼 (Password)
              </label>
              <button
                type="button"
                onClick={() => setShowHint((prev) => !prev)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>密碼提示</span>
              </button>
            </div>

            <div className="relative">
              <input
                id="dfm-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="請輸入今日登錄密碼..."
                autoFocus
                autoComplete="off"
                className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? '隱藏密碼' : '顯示密碼'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Password Hint Box */}
          {showHint && (
            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-700">
              <span className="font-medium text-slate-500">密碼提示：</span>
              <span className="font-bold text-slate-900">請聯絡開發者</span>
            </div>
          )}

          {/* Error Feedback */}
          {errorMsg && (
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">{errorMsg}</div>
                <div className="text-red-700">密碼提示：請聯絡開發者</div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>驗證並登入系統</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>DFM案例資料庫工作台</span>
          <span>密碼提示：請聯絡開發者</span>
        </div>
      </div>
    </div>
  );
};

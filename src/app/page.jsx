"use client";
// @ts-nocheck

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import {
  Baby, Timer, Droplet, BarChart2, Play, Pause, Square, Save,
  Settings, CheckCircle2, Mail, Lock, LogOut, Loader2
} from 'lucide-react';

import { auth, db } from '@/lib/firebase';

const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'default-app-id';

// --- Helper Functions ---
const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}j ${m}m ${s}d`;
  return `${m}m ${s}d`;
};

// --- Komponen Utama ---
export default function App() {
  // State Firebase & Database
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [appProfile, setAppProfile] = useState(null); // Data profil dari Firestore
  const [logs, setLogs] = useState([]);

  // State UI Aplikasi
  const [isAppAuthenticated, setIsAppAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Initialize auth state from sessionStorage after mount (to avoid hydration mismatch)
  useEffect(() => {
    setIsAppAuthenticated(sessionStorage.getItem('kinaa_auth') === 'true');
  }, []);

  // 1. Inisialisasi Firebase Auth (Wajib untuk koneksi aman)
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Handle anonymous sign in if not using custom token flow
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Gagal inisialisasi auth:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listener Firestore untuk Profil & Logs
  useEffect(() => {
    if (!firebaseUser) return;

    // Listener Profil
    const profileRef = doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'profile', 'main');
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setAppProfile(docSnap.data());
      } else {
        setAppProfile(null);
      }
      setIsLoadingData(false);
    }, (error) => console.error("Error fetching profile:", error));

    // Listener Logs (hanya jika sudah login aplikasi)
    let unsubLogs = () => { };
    if (isAppAuthenticated) {
      const logsRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'logs');
      unsubLogs = onSnapshot(logsRef, (snap) => {
        const fetchedLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Urutkan dari yang terlama ke terbaru (untuk diproses di UI)
        fetchedLogs.sort((a, b) => a.timestamp - b.timestamp);
        setLogs(fetchedLogs);
      }, (error) => console.error("Error fetching logs:", error));
    }

    return () => {
      unsubProfile();
      unsubLogs();
    };
  }, [firebaseUser, isAppAuthenticated]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const addLog = async (type, amount) => {
    if (!firebaseUser) return;
    try {
      const logsRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'logs');
      await addDoc(logsRef, {
        type,
        amount,
        timestamp: Date.now()
      });
      showToast(`Data ${type === 'volume' ? 'volume' : 'durasi'} berhasil disimpan!`);
      setActiveTab('home');
    } catch (error) {
      console.error("Gagal menyimpan log:", error);
      showToast("Gagal menyimpan data.");
    }
  };

  const handleLogout = () => {
    setIsAppAuthenticated(false);
    sessionStorage.removeItem('kinaa_auth');
    setActiveTab('home');
  };

  // Tampilan Loading Awal
  if (!isAuthReady || isLoadingData) {
    return (
      <div className="min-h-screen bg-rose-50 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-rose-500" size={48} />
        <p className="text-rose-600 font-medium animate-pulse">Menyiapkan KINAA...</p>
      </div>
    );
  }

  // Tampilan Login / Register (Jika belum terautentikasi di level aplikasi)
  if (!isAppAuthenticated) {
    return (
      <AuthScreen
        firebaseUser={firebaseUser}
        appProfile={appProfile}
        onAuthSuccess={() => {
          setIsAppAuthenticated(true);
          sessionStorage.setItem('kinaa_auth', 'true');
        }}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20 sm:pb-0 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative overflow-hidden flex flex-col">

        {/* Header */}
        <header className="bg-rose-500 text-white p-4 shadow-md rounded-b-2xl z-10 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-wide">KINAA APP</h1>
            <p className="text-xs text-rose-100 opacity-90 capitalize">
              Halo, Bayi {appProfile?.name || 'Kinaa'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 bg-rose-600 rounded-full hover:bg-rose-700 transition flex items-center shadow-inner"
            title="Keluar"
          >
            <LogOut size={18} className="text-rose-50" />
          </button>
        </header>

        {/* Konten Utama */}
        <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {activeTab === 'home' && <Dashboard profile={appProfile} logs={logs} />}
          {activeTab === 'timer' && <TimerTracker onSave={(duration) => addLog('duration', duration)} />}
          {activeTab === 'volume' && <VolumeTracker onSave={(vol) => addLog('volume', vol)} />}
          {activeTab === 'chart' && <ChartView profile={appProfile} logs={logs} />}
        </main>

        {/* Toast Notification */}
        {toast && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-teal-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-bounce z-50 whitespace-nowrap">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">{toast}</span>
          </div>
        )}

        {/* Bottom Navigation */}
        <nav className="fixed sm:absolute bottom-0 w-full max-w-md bg-white border-t border-slate-200 flex justify-around p-2 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <NavButton icon={Baby} label="Home" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavButton icon={Timer} label="Durasi" isActive={activeTab === 'timer'} onClick={() => setActiveTab('timer')} />
          <NavButton icon={Droplet} label="Volume" isActive={activeTab === 'volume'} onClick={() => setActiveTab('volume')} />
          <NavButton icon={BarChart2} label="Grafik" isActive={activeTab === 'chart'} onClick={() => setActiveTab('chart')} />
        </nav>
      </div>
    </div>
  );
}

// --- Komponen Autentikasi (Login & Register) ---
function AuthScreen({ firebaseUser, appProfile, onAuthSuccess, showToast }) {
  const [mode, setMode] = useState(appProfile ? 'login' : 'register');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [babyName, setBabyName] = useState('');
  const [babyDob, setBabyDob] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setIsLoading(true);

    try {
      if (mode === 'register') {
        const profileRef = doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'profile', 'main');
        await setDoc(profileRef, {
          email: email.toLowerCase(),
          password,
          name: babyName,
          dob: babyDob,
          createdAt: Date.now()
        });
        showToast("Pendaftaran berhasil!");
        onAuthSuccess();
      } else {
        if (appProfile && appProfile.email === email.toLowerCase() && appProfile.password === password) {
          showToast("Berhasil masuk!");
          onAuthSuccess();
        } else {
          showToast("Email atau Password salah!");
        }
      }
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rose-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm border border-rose-100">
        <div className="flex justify-center mb-6">
          <div className="bg-gradient-to-tr from-rose-400 to-rose-500 p-4 rounded-full text-white shadow-lg shadow-rose-200">
            <Baby size={48} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">KINAA APP</h2>
        <p className="text-sm text-center text-slate-500 mb-8">
          {mode === 'login' ? 'Silakan masuk ke akun Anda' : 'Buat akun untuk menyimpan data bayi Anda'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition"
                placeholder="email@contoh.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="pt-2 space-y-4 border-t border-slate-100 mt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Nama Bayi</label>
                <input
                  type="text"
                  value={babyName}
                  onChange={(e) => setBabyName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition"
                  placeholder="Contoh: Kinaa"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Tanggal Lahir</label>
                <input
                  type="date"
                  value={babyDob}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setBabyDob(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-bold py-3 px-4 rounded-xl transition-all mt-6 shadow-md shadow-rose-200 flex justify-center items-center"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : (mode === 'login' ? 'Masuk' : 'Daftar & Mulai')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="ml-1 text-rose-500 font-semibold hover:underline"
            >
              {mode === 'login' ? 'Daftar di sini' : 'Masuk'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Komponen Pendukung ---

function NavButton({ icon: Icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center p-2 rounded-xl w-16 transition-all ${isActive ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-slate-600'}`}
    >
      <Icon size={24} className={isActive ? 'fill-rose-100' : ''} />
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  );
}

function Dashboard({ profile, logs }) {
  const ageInDays = useMemo(() => {
    if (!profile?.dob) return 0;
    const birthDate = new Date(profile.dob);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - birthDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [profile]);

  const ageText = useMemo(() => {
    const months = Math.floor(ageInDays / 30);
    const days = ageInDays % 30;
    if (months > 0) return `${months} Bulan ${days} Hari`;
    return `${days} Hari`;
  }, [ageInDays]);

  const todayLogs = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return logs.filter(log => {
      const logDate = new Date(log.timestamp).setHours(0, 0, 0, 0);
      return logDate === today;
    });
  }, [logs]);

  const totalVolumeToday = todayLogs.filter(l => l.type === 'volume').reduce((acc, curr) => acc + curr.amount, 0);
  const totalDurationToday = todayLogs.filter(l => l.type === 'duration').reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-6 pb-6">
      <div className="bg-gradient-to-br from-rose-400 to-rose-500 rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="bg-white/20 p-3 rounded-full">
            <Baby size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold">{profile?.name || 'Bayi'}</h3>
            <p className="text-rose-100 text-sm">Usia: {ageText}</p>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-bold text-slate-800 mb-3 text-lg">Ringkasan Hari Ini</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
            <Droplet className="text-blue-500 mb-2" size={28} />
            <span className="text-2xl font-black text-blue-900">{totalVolumeToday}</span>
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">ml ASI/Susu</span>
          </div>
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
            <Timer className="text-amber-500 mb-2" size={28} />
            <span className="text-xl font-black text-amber-900">{formatTime(totalDurationToday)}</span>
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Menyusui</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-bold text-slate-800 mb-3 text-lg">Aktivitas Terakhir</h4>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-slate-400 bg-slate-100 rounded-2xl border border-dashed border-slate-300">
            <p className="text-sm">Belum ada catatan hari ini.</p>
            <p className="text-xs mt-1">Gunakan tombol di bawah untuk mencatat.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.slice().reverse().slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${log.type === 'volume' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                    {log.type === 'volume' ? <Droplet size={18} /> : <Timer size={18} />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {log.type === 'volume' ? 'Minum Susu/ASI' : 'Menyusui Langsung'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="font-bold text-slate-700">
                  {log.type === 'volume' ? `${log.amount} ml` : formatTime(log.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimerTracker({ onSave }) {
  const [mode, setMode] = useState('stopwatch');
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const startTimeRef = useRef(null);
  const accumulatedRef = useRef(0);
  const timerRef = useRef(null);
  
  const [manualHours, setManualHours] = useState(0);
  const [manualMins, setManualMins] = useState(0);

  const startTimer = () => {
    setIsRunning(true);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setTime(accumulatedRef.current + elapsed);
    }, 1000);
  };

  const pauseTimer = () => {
    setIsRunning(false);
    clearInterval(timerRef.current);
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    accumulatedRef.current += elapsed;
    setTime(accumulatedRef.current);
  };

  const toggleTimer = () => {
    if (isRunning) pauseTimer();
    else startTimer();
  };

  const handleStopAndSave = () => {
    let finalTime = accumulatedRef.current;
    if (isRunning) {
      clearInterval(timerRef.current);
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      finalTime += elapsed;
      setIsRunning(false);
    }
    
    if (finalTime > 0) {
      onSave(finalTime);
      accumulatedRef.current = 0;
      setTime(0);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);

  const handleSaveManual = () => {
    const totalSeconds = (manualHours * 3600) + (manualMins * 60);
    if (totalSeconds > 0) {
      onSave(totalSeconds);
      setManualHours(0);
      setManualMins(0);
    }
  };

  const formatDisplay = (totalSecs) => {
    const h = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const s = String(totalSecs % 60).padStart(2, '0');
    return { h, m, s };
  };
  const display = formatDisplay(time);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setMode('stopwatch')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${mode === 'stopwatch' ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-500'}`}
        >
          Stopwatch
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${mode === 'manual' ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-500'}`}
        >
          Input Manual
        </button>
      </div>

      {mode === 'stopwatch' ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-10">
          <div className="relative">
            {isRunning && (
              <div className="absolute inset-0 bg-rose-200 rounded-full animate-ping opacity-50"></div>
            )}
            <div className="w-56 h-56 rounded-full border-8 border-rose-100 bg-white shadow-xl flex flex-col items-center justify-center relative z-10">
              <span className="text-5xl font-mono font-bold text-slate-800 tracking-tighter">
                {display.h !== '00' ? `${display.h}:` : ''}{display.m}:{display.s}
              </span>
              <span className="text-sm text-slate-400 mt-2 font-medium">Sedang Menyusui</span>
            </div>
          </div>

          <div className="flex space-x-6">
            {!isRunning && time === 0 ? (
              <button
                onClick={startTimer}
                className="w-20 h-20 bg-teal-500 hover:bg-teal-600 text-white rounded-full flex flex-col items-center justify-center shadow-lg shadow-teal-200 transition-transform transform hover:scale-105 active:scale-95"
              >
                <Play size={32} className="ml-1" fill="currentColor" />
              </button>
            ) : (
              <>
                <button
                  onClick={toggleTimer}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-transform transform active:scale-95 text-white ${isRunning ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-teal-500 hover:bg-teal-600 shadow-teal-200'}`}
                >
                  {isRunning ? <Pause size={28} fill="currentColor" /> : <Play size={28} className="ml-1" fill="currentColor" />}
                </button>
                <button
                  onClick={handleStopAndSave}
                  className="w-16 h-16 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex flex-col items-center justify-center shadow-md shadow-rose-200 transition-transform transform active:scale-95"
                >
                  <Square size={24} fill="currentColor" />
                </button>
              </>
            )}
          </div>
          {time > 0 && !isRunning && (
            <p className="text-sm text-slate-500">Tekan kotak merah untuk menyimpan</p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center space-y-6 mt-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-center font-bold text-slate-700 mb-6 text-lg">Masukkan Durasi Manual</h3>
            <div className="flex items-center justify-center space-x-4">
              <div className="flex flex-col items-center">
                <input
                  type="number" min="0"
                  value={manualHours === 0 ? '' : manualHours}
                  onChange={(e) => setManualHours(parseInt(e.target.value) || 0)}
                  className="w-20 text-center text-3xl font-bold border-b-2 border-slate-200 focus:border-rose-500 focus:outline-none pb-2 text-slate-800"
                  placeholder="00"
                />
                <span className="text-xs text-slate-400 mt-2 font-medium">JAM</span>
              </div>
              <span className="text-3xl font-bold text-slate-300 pb-6">:</span>
              <div className="flex flex-col items-center">
                <input
                  type="number" min="0" max="59"
                  value={manualMins === 0 ? '' : manualMins}
                  onChange={(e) => setManualMins(parseInt(e.target.value) || 0)}
                  className="w-20 text-center text-3xl font-bold border-b-2 border-slate-200 focus:border-rose-500 focus:outline-none pb-2 text-slate-800"
                  placeholder="00"
                />
                <span className="text-xs text-slate-400 mt-2 font-medium">MENIT</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleSaveManual}
            disabled={manualHours === 0 && manualMins === 0}
            className="w-full bg-rose-500 disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg transition-colors flex items-center justify-center"
          >
            <Save className="mr-2" size={20} /> Simpan Catatan
          </button>
        </div>
      )}
    </div>
  );
}

function VolumeTracker({ onSave }) {
  const [volume, setVolume] = useState('');

  const handleSave = () => {
    const val = parseInt(volume);
    if (val > 0) {
      onSave(val);
      setVolume('');
    }
  };

  const addAmount = (amt) => {
    const current = parseInt(volume) || 0;
    setVolume(String(current + amt));
  };

  return (
    <div className="flex flex-col h-full space-y-6 pt-4">
      <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 flex flex-col items-center justify-center shadow-sm">
        <div className="bg-white p-4 rounded-full shadow-sm text-blue-500 mb-4">
          <Droplet size={32} />
        </div>
        <h3 className="text-center font-bold text-blue-900 mb-4">Volume ASI / Susu</h3>

        <div className="flex items-center space-x-2 bg-white rounded-2xl px-6 py-4 shadow-inner w-full max-w-xs">
          <input
            type="number" min="0"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="flex-1 text-center text-5xl font-black text-slate-800 focus:outline-none bg-transparent w-full"
            placeholder="0"
          />
          <span className="text-xl font-bold text-slate-400">ml</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        {[10, 30, 50, 90, 120, 150].map((amt) => (
          <button
            key={amt}
            onClick={() => addAmount(amt)}
            className="bg-white border border-slate-200 py-3 rounded-xl text-slate-600 font-semibold shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors flex flex-col items-center"
          >
            <span className="text-xs text-slate-400 mb-1">+ Tambah</span>
            <span className="text-lg">{amt} ml</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex items-end mt-6">
        <button
          onClick={handleSave}
          disabled={!volume || parseInt(volume) <= 0}
          className="w-full bg-blue-500 disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-colors flex items-center justify-center"
        >
          <Save className="mr-2" size={20} /> Simpan Data Volume
        </button>
      </div>
    </div>
  );
}

function ChartView({ profile, logs }) {
  const getTargetVolume = () => {
    if (!profile?.dob) return 600;
    const birthDate = new Date(profile.dob);
    const today = new Date();
    const ageInMonths = Math.abs(today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    if (ageInMonths < 1) return 600;
    if (ageInMonths < 3) return 750;
    if (ageInMonths < 6) return 900;
    return 800;
  };

  const targetLineValue = getTargetVolume();

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const dayLogs = logs.filter(log => {
        const logDate = new Date(log.timestamp).setHours(0, 0, 0, 0);
        return logDate === d.getTime();
      });

      const totalVol = dayLogs.filter(l => l.type === 'volume').reduce((acc, curr) => acc + curr.amount, 0);

      data.push({
        dateStr: d.toLocaleDateString('id-ID', { weekday: 'short' }),
        volume: totalVol,
        isToday: i === 0
      });
    }
    return data;
  }, [logs]);

  const maxDataValue = Math.max(...chartData.map(d => d.volume));
  const yMax = Math.max(targetLineValue + 200, maxDataValue + 100);

  return (
    <div className="space-y-6 pt-2">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Grafik Asupan Volume</h2>
        <p className="text-sm text-slate-500">Bandingkan konsumsi aktual vs batas normal</p>
      </div>

      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 relative pt-10 pb-6">
        <div className="absolute top-4 left-4 flex items-center space-x-2 text-xs font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded">
          <div className="w-3 h-0.5 bg-rose-500"></div>
          <span>Target Normal Usia Ini: {targetLineValue}ml</span>
        </div>

        <div className="h-64 flex items-end justify-between space-x-2 relative mt-4 border-b border-slate-200 pb-2">
          <div
            className="absolute w-full border-t-2 border-dashed border-rose-400 z-0 flex items-end justify-end transition-all duration-500"
            style={{ bottom: `${(targetLineValue / yMax) * 100}%` }}
          ></div>

          {chartData.map((data, idx) => {
            const heightPercentage = (data.volume / yMax) * 100;
            const isMetTarget = data.volume >= targetLineValue;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full z-10 group relative">
                <div className="opacity-0 group-hover:opacity-100 group-active:opacity-100 absolute -top-8 bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none transition-opacity whitespace-nowrap">
                  {data.volume} ml
                </div>
                <div
                  className={`w-full max-w-[32px] rounded-t-md transition-all duration-700 ease-out ${data.volume === 0 ? 'bg-slate-100' : isMetTarget ? 'bg-teal-400' : 'bg-blue-400'}`}
                  style={{ height: `${Math.max(heightPercentage, 1)}%` }}
                ></div>
                <span className={`text-[10px] mt-2 font-medium ${data.isToday ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                  {data.dateStr}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <h4 className="font-semibold text-slate-700 text-sm mb-2 flex items-center">
          <Settings size={16} className="mr-2" /> Wawasan KINAA
        </h4>
        <p className="text-xs text-slate-500 leading-relaxed">
          Garis putus-putus merah merepresentasikan estimasi kebutuhan cairan per hari berdasarkan umur bayi. Pastikan asupan bayi Anda mendekati atau berada di atas garis target tersebut.
        </p>
      </div>
    </div>
  );
}

"use client";
// @ts-nocheck

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, confirmPasswordReset } from 'firebase/auth';
import { doc, setDoc, collection, onSnapshot, addDoc, deleteDoc, query } from 'firebase/firestore';
import {
  Baby, Timer, Droplet, BarChart2, Play, Pause, Square, Save,
  Settings, CheckCircle2, Mail, Lock, LogOut, Loader2, Bell, Plus, X, Trash2,
  ChevronLeft, ChevronRight, Calendar
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

  // Tutorial State
  const [runTour, setRunTour] = useState(false);
  const [tourSteps, setTourSteps] = useState([]);

  // Auth Action State
  const [authMode, setAuthMode] = useState(null);
  const [oobCode, setOobCode] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const mode = searchParams.get('mode');
      const oob = searchParams.get('oobCode');
      if (mode === 'resetPassword' && oob) {
        setAuthMode('new_password');
        setOobCode(oob);
      }
    }
  }, []);

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('kinaa_has_seen_tutorial', 'true');
      localStorage.setItem('kinaa_has_seen_reminder_tour', 'true');
    }
  };

  useEffect(() => {
    if (isAppAuthenticated && !isLoadingData) {
      const hasSeenMain = localStorage.getItem('kinaa_has_seen_tutorial');
      const hasSeenReminder = localStorage.getItem('kinaa_has_seen_reminder_tour');
      
      if (!hasSeenMain) {
        setTourSteps([
          {
            target: 'body',
            content: 'Selamat datang di Kinaa App! Aplikasi ini dibuat untuk membantu Anda memantau nutrisi bayi Anda. Mari kita mulai tur singkat.',
            placement: 'center',
            disableBeacon: true,
          },
          {
            target: '.tour-reminder',
            content: '✨ FITUR BARU! ✨ Kini Anda bisa mengatur Pengingat (Reminder) untuk jadwal menyusui atau pumping agar tidak terlewat!',
          },
          {
            target: '.tour-home',
            content: 'Ini adalah halaman Beranda. Di sini Anda bisa melihat ringkasan aktivitas hari ini.',
          },
          {
            target: '.tour-timer',
            content: 'Gunakan tab Durasi untuk mencatat waktu menyusui.',
          },
          {
            target: '.tour-volume',
            content: 'Catat volume susu yang diminum bayi Anda di sini.',
          },
          {
            target: '.tour-chart',
            content: 'Lihat ringkasan 7 hari terakhir di tab Grafik.',
          }
        ]);
        setRunTour(true);
      } else if (!hasSeenReminder) {
        setTourSteps([
          {
            target: '.tour-reminder',
            content: '✨ FITUR BARU! ✨ Kini Anda bisa mengatur Pengingat (Reminder) untuk jadwal menyusui atau pumping agar tidak terlewat!',
            disableBeacon: true,
            placement: 'top',
          }
        ]);
        setRunTour(true);
      }
    }
  }, [isAppAuthenticated, isLoadingData]);

  // Initialize auth state from sessionStorage after mount (to avoid hydration mismatch)
  useEffect(() => {
    setIsAppAuthenticated(sessionStorage.getItem('kinaa_auth') === 'true');
  }, []);

  // 1. Inisialisasi Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listener Firestore untuk Profil & Logs
  useEffect(() => {
    if (!firebaseUser) {
      setIsLoadingData(false);
      return;
    }

    // Listener Profil
    const profileRef = doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'profile', 'main');
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setAppProfile(docSnap.data());
      } else {
        setAppProfile(null);
      }
      setIsLoadingData(false);
    }, (error) => {
      console.error("Error fetching profile:", error);
      setIsLoadingData(false);
    });

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
        initialMode={authMode}
        oobCode={oobCode}
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
          {activeTab === 'chart' && <ChartView profile={appProfile} logs={logs} appId={appId} firebaseUser={firebaseUser} showToast={showToast} />}
          {activeTab === 'reminder' && <ReminderModule appId={appId} firebaseUser={firebaseUser} onLog={(type, amount) => addLog(type, amount)} showToast={showToast} />}
        </main>

        {/* Toast Notification */}
        {toast && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-teal-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-bounce z-50 whitespace-nowrap">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">{toast}</span>
          </div>
        )}

        {/* Bottom Navigation */}
        <Joyride
          steps={tourSteps}
          run={runTour}
          continuous={true}
          showProgress={true}
          showSkipButton={true}
          callback={handleJoyrideCallback}
          styles={{
            options: {
              primaryColor: '#f43f5e',
              zIndex: 1000,
            }
          }}
        />
        <nav className="fixed sm:absolute bottom-0 w-full max-w-md bg-white border-t border-slate-200 flex justify-around p-2 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <NavButton tourClass="tour-home" icon={Baby} label="Home" isActive={activeTab === 'home'} onClick={() => { setActiveTab('home'); setRunTour(false); }} />
          <NavButton tourClass="tour-timer" icon={Timer} label="Durasi" isActive={activeTab === 'timer'} onClick={() => { setActiveTab('timer'); setRunTour(false); }} />
          <NavButton tourClass="tour-volume" icon={Droplet} label="Volume" isActive={activeTab === 'volume'} onClick={() => { setActiveTab('volume'); setRunTour(false); }} />
          <NavButton tourClass="tour-chart" icon={BarChart2} label="Grafik" isActive={activeTab === 'chart'} onClick={() => { setActiveTab('chart'); setRunTour(false); }} />
          <NavButton tourClass="tour-reminder" icon={Bell} label="Pengingat" isActive={activeTab === 'reminder'} onClick={() => { setActiveTab('reminder'); setRunTour(false); }} />
        </nav>
      </div>
    </div>
  );
}

// --- Komponen Autentikasi (Login & Register) ---
function AuthScreen({ firebaseUser, appProfile, onAuthSuccess, showToast, initialMode, oobCode }) {
  const [mode, setMode] = useState(initialMode || (appProfile ? 'login' : 'register'));

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [babyName, setBabyName] = useState('');
  const [babyDob, setBabyDob] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isValidEmail = (email) => {
    return /\S+@\S+\.\S+/.test(email);
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (password.length < 6) {
      setErrorMsg("Password minimal 6 karakter.");
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      showToast("Password berhasil diperbarui! Silakan login.");
      setMode('login');
      // Bersihkan URL parameters tanpa mereload halaman
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error(error);
      setErrorMsg("Gagal memperbarui password. Link mungkin kedaluwarsa.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!isValidEmail(email)) {
      setErrorMsg("Format email tidak valid.");
      return;
    }

    if (mode === 'register' && password.length < 6) {
      setErrorMsg("Password minimal 6 karakter.");
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password);
        const profileRef = doc(db, 'artifacts', appId, 'users', userCredential.user.uid, 'profile', 'main');
        await setDoc(profileRef, {
          email: email.toLowerCase(),
          name: babyName,
          dob: babyDob,
          createdAt: Date.now()
        });
        showToast("Pendaftaran berhasil!");
        onAuthSuccess();
      } else {
        await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
        showToast("Berhasil masuk!");
        onAuthSuccess();
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') setErrorMsg("Email sudah terdaftar.");
      else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') setErrorMsg("Email atau Password salah!");
      else setErrorMsg("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!isValidEmail(email)) {
      setErrorMsg("Format email tidak valid.");
      return;
    }
    
    setIsLoading(true);
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}?mode=resetPassword`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, email.toLowerCase(), actionCodeSettings);
      showToast("Email reset password telah dikirim!");
      setMode('login');
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/user-not-found') setErrorMsg("Email tidak terdaftar.");
      else setErrorMsg("Gagal mengirim email reset.");
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
        <p className="text-sm text-center text-slate-500 mb-6">
          {mode === 'login' ? 'Silakan masuk ke akun Anda' : mode === 'forgot' ? 'Pemulihan Password' : mode === 'new_password' ? 'Buat Password Baru Anda' : 'Buat akun untuk menyimpan data bayi Anda'}
        </p>

        {errorMsg && (
          <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-xl mb-4 border border-rose-100 flex items-center">
            <X size={14} className="mr-2" /> {errorMsg}
          </div>
        )}

        {mode === 'new_password' ? (
          <form onSubmit={handleNewPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Password Baru</label>
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
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-bold py-3 px-4 rounded-xl transition-all mt-6 shadow-md shadow-rose-200 flex justify-center items-center"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Simpan Password'}
            </button>
            <div className="text-center mt-4">
              <button type="button" onClick={() => {
                setMode('login');
                if (typeof window !== 'undefined') window.history.replaceState({}, document.title, window.location.pathname);
              }} className="text-sm text-slate-500 hover:text-rose-500 font-semibold transition">
                Batal
              </button>
            </div>
          </form>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Email Akun</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition"
                  placeholder="email@contoh.com"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 px-4 rounded-xl transition-all mt-6 shadow-md shadow-rose-200"
            >
              Kirim Email Reset
            </button>
            <div className="text-center mt-4">
              <button type="button" onClick={() => setMode('login')} className="text-sm text-slate-500 hover:text-rose-500 font-semibold transition">
                Kembali ke Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
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

            {mode === 'login' && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setErrorMsg(''); }}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition"
                >
                  Lupa Password?
                </button>
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
        )}

        {mode !== 'forgot' && (
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErrorMsg(''); }}
                className="ml-1 text-rose-500 font-semibold hover:underline"
              >
                {mode === 'login' ? 'Daftar di sini' : 'Masuk'}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Komponen Pendukung ---

function NavButton({ icon: Icon, label, isActive, onClick, tourClass }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center p-2 rounded-xl w-16 transition-all ${isActive ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-slate-600'} ${tourClass || ''}`}
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

function ChartView({ profile, logs, appId, firebaseUser, showToast }) {
  const [viewMode, setViewMode] = useState('mingguan'); // harian, mingguan, bulanan, tahunan
  const [currentDate, setCurrentDate] = useState(new Date());

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

  const dailyTarget = getTargetVolume();

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'harian') d.setDate(d.getDate() - 1);
    if (viewMode === 'mingguan') d.setDate(d.getDate() - 7);
    if (viewMode === 'bulanan') d.setMonth(d.getMonth() - 1);
    if (viewMode === 'tahunan') d.setFullYear(d.getFullYear() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'harian') d.setDate(d.getDate() + 1);
    if (viewMode === 'mingguan') d.setDate(d.getDate() + 7);
    if (viewMode === 'bulanan') d.setMonth(d.getMonth() + 1);
    if (viewMode === 'tahunan') d.setFullYear(d.getFullYear() + 1);
    if (d > new Date()) return;
    setCurrentDate(d);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  };

  const getVisibleLogs = useMemo(() => {
    return logs.filter(log => {
      const logDate = new Date(log.timestamp);
      if (viewMode === 'harian') {
        return logDate.toDateString() === currentDate.toDateString();
      } else if (viewMode === 'mingguan') {
        const start = new Date(currentDate);
        const day = start.getDay() || 7;
        start.setDate(start.getDate() - day + 1);
        start.setHours(0,0,0,0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23,59,59,999);
        return logDate >= start && logDate <= end;
      } else if (viewMode === 'bulanan') {
        return logDate.getMonth() === currentDate.getMonth() && logDate.getFullYear() === currentDate.getFullYear();
      } else if (viewMode === 'tahunan') {
        return logDate.getFullYear() === currentDate.getFullYear();
      }
      return false;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [logs, currentDate, viewMode]);

  const { chartData, displayTarget } = useMemo(() => {
    const data = [];
    let target = dailyTarget;

    if (viewMode === 'harian') {
      target = dailyTarget / 6;
      for (let i = 0; i < 24; i += 4) {
        const intervalLogs = getVisibleLogs.filter(l => {
          const h = new Date(l.timestamp).getHours();
          return h >= i && h < i + 4;
        });
        const totalVol = intervalLogs.filter(l => l.type === 'volume').reduce((a, c) => a + c.amount, 0);
        data.push({
          label: `${String(i).padStart(2,'0')}:00`,
          volume: totalVol,
          isToday: isToday(currentDate) && new Date().getHours() >= i && new Date().getHours() < i + 4
        });
      }
    } else if (viewMode === 'mingguan') {
      const start = new Date(currentDate);
      const day = start.getDay() || 7; 
      start.setDate(start.getDate() - day + 1);
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dayLogs = getVisibleLogs.filter(l => new Date(l.timestamp).toDateString() === d.toDateString());
        const totalVol = dayLogs.filter(l => l.type === 'volume').reduce((a, c) => a + c.amount, 0);
        data.push({
          label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
          volume: totalVol,
          isToday: isToday(d)
        });
      }
    } else if (viewMode === 'bulanan') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const weeks = [
        { label: 'W1', start: 1, end: 7 },
        { label: 'W2', start: 8, end: 14 },
        { label: 'W3', start: 15, end: 21 },
        { label: 'W4', start: 22, end: lastDay }
      ];
      weeks.forEach(w => {
        const weekLogs = getVisibleLogs.filter(l => {
          const d = new Date(l.timestamp).getDate();
          return d >= w.start && d <= w.end;
        });
        const totalVol = weekLogs.filter(l => l.type === 'volume').reduce((a, c) => a + c.amount, 0);
        const daysInWeek = w.end - w.start + 1;
        data.push({
          label: w.label,
          volume: Math.round(totalVol / daysInWeek),
          isToday: isToday(new Date()) && currentDate.getMonth() === new Date().getMonth() && new Date().getDate() >= w.start && new Date().getDate() <= w.end
        });
      });
    } else if (viewMode === 'tahunan') {
      const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      for (let i = 0; i < 12; i++) {
        const monthLogs = getVisibleLogs.filter(l => new Date(l.timestamp).getMonth() === i);
        const totalVol = monthLogs.filter(l => l.type === 'volume').reduce((a, c) => a + c.amount, 0);
        const daysInMonth = new Date(currentDate.getFullYear(), i + 1, 0).getDate();
        data.push({
          label: months[i],
          volume: Math.round(totalVol / daysInMonth),
          isToday: isToday(new Date()) && new Date().getMonth() === i
        });
      }
    }
    return { chartData: data, displayTarget: target };
  }, [getVisibleLogs, currentDate, viewMode, dailyTarget]);

  const maxDataValue = Math.max(...chartData.map(d => d.volume));
  const yMax = Math.max(displayTarget + (viewMode === 'harian' ? 50 : 200), maxDataValue + (viewMode === 'harian' ? 20 : 100));

  const getDateRangeLabel = () => {
    if (viewMode === 'harian') return currentDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    if (viewMode === 'mingguan') {
      const start = new Date(currentDate);
      const day = start.getDay() || 7; 
      start.setDate(start.getDate() - day + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.getDate()} ${start.toLocaleDateString('id-ID', {month:'short'})} - ${end.getDate()} ${end.toLocaleDateString('id-ID', {month:'short', year:'numeric'})}`;
    }
    if (viewMode === 'bulanan') return currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return currentDate.getFullYear().toString();
  };

  const handleDeleteLog = async (logId) => {
    if (!firebaseUser || !appId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'logs', logId));
      showToast("Data berhasil dihapus");
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus data");
    }
  };

  return (
    <div className="space-y-6 pt-2 pb-12">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Grafik & Histori</h2>
        <div className="flex justify-center space-x-2 bg-slate-100 p-1 rounded-xl mx-auto w-fit">
          {['harian', 'mingguan', 'bulanan', 'tahunan'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded-lg capitalize transition-all ${viewMode === mode ? 'bg-white shadow text-rose-500' : 'text-slate-500 hover:bg-slate-200'}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
        <button onClick={handlePrev} className="p-2 text-slate-400 hover:text-rose-500 transition"><ChevronLeft size={20} /></button>
        <div className="flex items-center space-x-2 text-slate-700 font-semibold text-xs sm:text-sm">
          <Calendar size={16} className="text-rose-400" />
          <span>{getDateRangeLabel()}</span>
        </div>
        <button onClick={handleNext} disabled={currentDate > new Date() || isToday(currentDate)} className={`p-2 transition ${currentDate >= new Date() && isToday(currentDate) ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-rose-500'}`}><ChevronRight size={20} /></button>
      </div>

      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 relative pt-10 pb-6">
        <div className="absolute top-4 left-4 flex items-center space-x-2 text-[10px] font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded">
          <div className="w-3 h-0.5 bg-rose-500"></div>
          <span>Target {viewMode === 'harian' ? 'Per 4 Jam' : 'Rata-rata Harian'}: {Math.round(displayTarget)}ml</span>
        </div>

        <div className="h-64 flex items-end justify-between space-x-1 sm:space-x-2 relative mt-4 border-b border-slate-200 pb-2">
          <div
            className="absolute w-full border-t-2 border-dashed border-rose-400 z-0 flex items-end justify-end transition-all duration-500"
            style={{ bottom: `${(displayTarget / yMax) * 100}%` }}
          ></div>

          {chartData.map((data, idx) => {
            const heightPercentage = (data.volume / yMax) * 100;
            const isMetTarget = data.volume >= displayTarget;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full z-10 group relative">
                <div className="opacity-0 group-hover:opacity-100 group-active:opacity-100 absolute -top-8 bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none transition-opacity whitespace-nowrap">
                  {data.volume} ml
                </div>
                <div
                  className={`w-full max-w-[32px] rounded-t-md transition-all duration-700 ease-out ${data.volume === 0 ? 'bg-slate-100' : isMetTarget ? 'bg-teal-400' : 'bg-blue-400'}`}
                  style={{ height: `${Math.max(heightPercentage, 1)}%` }}
                ></div>
                <span className={`text-[9px] sm:text-[10px] mt-2 font-medium ${data.isToday ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                  {data.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center">Histori Aktivitas</h3>
        {getVisibleLogs.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-4">Belum ada catatan pada periode ini.</p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
            {getVisibleLogs.map(log => {
              const isVol = log.type === 'volume';
              const timeStr = new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
              const dateStr = new Date(log.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
              return (
                <li key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${isVol ? 'bg-blue-100 text-blue-500' : 'bg-rose-100 text-rose-500'}`}>
                      {isVol ? <Droplet size={16} /> : <Timer size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{isVol ? 'Minum Susu' : 'Menyusui Langsung'}</p>
                      <p className="text-[10px] text-slate-500">{dateStr} • {timeStr}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`font-bold font-mono text-sm ${isVol ? 'text-blue-600' : 'text-rose-600'}`}>
                      {isVol ? `${log.amount}ml` : formatTime(log.amount)}
                    </span>
                    <button onClick={() => handleDeleteLog(log.id)} className="text-slate-300 hover:text-rose-500 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Komponen Reminder ---
function ReminderModule({ appId, firebaseUser, onLog, showToast }) {
  const [reminders, setReminders] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [permission, setPermission] = useState('default');

  // Form states
  const [type, setType] = useState('dbf');
  const [timeStr, setTimeStr] = useState('08:00');
  const [side, setSide] = useState('both');
  const [frequency, setFrequency] = useState('2');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const remRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'reminders');
    const unsub = onSnapshot(remRef, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReminders(data);
    });
    return () => unsub();
  }, [appId, firebaseUser]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && permission !== 'granted') {
      const p = await Notification.requestPermission();
      setPermission(p);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    requestNotificationPermission();
    
    try {
      const remRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'reminders');
      await addDoc(remRef, {
        type,
        timeStr,
        side: type === 'pumping' ? side : null,
        frequency: parseInt(frequency),
        isActive: true,
        createdAt: Date.now()
      });
      setIsModalOpen(false);
      showToast("Pengingat berhasil disimpan!");
    } catch (error) {
      console.error(error);
      showToast("Gagal menyimpan pengingat.");
    }
  };

  const deleteReminder = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'reminders', id));
      showToast("Pengingat dihapus");
    } catch (err) {
      console.error(err);
    }
  };

  // Notification Checker
  useEffect(() => {
    if (permission !== 'granted') return;
    
    const checkAlarms = () => {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;
      
      reminders.forEach(rem => {
        if (rem.isActive && rem.timeStr === currentTimeStr && now.getSeconds() < 10) {
          const title = rem.type === 'dbf' ? 'Waktunya Menyusui!' : 'Waktunya Pumping!';
          const body = rem.type === 'pumping' ? `Jangan lupa pumping (Sisi: ${rem.side === 'both' ? 'Keduanya' : rem.side === 'left' ? 'Kiri' : 'Kanan'}).` : 'Ayo susui si kecil!';
          
          const notification = new Notification(title, {
            body,
            icon: '/favicon.ico',
            requireInteraction: true
          });
          
          notification.onclick = () => {
            onLog(rem.type === 'dbf' ? 'duration' : 'volume', rem.type === 'dbf' ? 600 : 120);
            notification.close();
            window.focus();
            showToast("Berhasil dicatat dari pengingat!");
          };
        }
      });
    };

    const interval = setInterval(checkAlarms, 10000);
    return () => clearInterval(interval);
  }, [reminders, permission, onLog, showToast]);

  return (
    <div className="absolute inset-0 bg-slate-50 overflow-y-auto pb-24 p-4 text-slate-800">
      <div className="flex justify-between items-center mb-6 pt-2">
        <h2 className="text-xl font-bold text-slate-800">Pengingat Jadwal</h2>
        {permission !== 'granted' && (
          <button onClick={requestNotificationPermission} className="text-[10px] bg-rose-500 text-white px-2 py-1 rounded shadow hover:bg-rose-600 transition font-bold">
            Aktifkan Notifikasi
          </button>
        )}
      </div>

      <div className="space-y-4">
        {reminders.length === 0 ? (
          <div className="text-center text-slate-400 mt-10">
            <Bell size={48} className="mx-auto mb-4 opacity-30" />
            <p>Belum ada jadwal. Tambahkan pengingat agar tidak terlewat!</p>
          </div>
        ) : (
          reminders.map(rem => (
            <div key={rem.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
              <div>
                <h3 className="text-2xl font-bold font-mono tracking-tighter text-slate-700">{rem.timeStr}</h3>
                <p className="text-xs text-rose-500 font-bold mt-1">
                  {rem.type === 'dbf' ? 'Menyusui Langsung' : `Pumping (${rem.side === 'both' ? 'Keduanya' : rem.side === 'left' ? 'Kiri' : 'Kanan'})`}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Setiap {rem.frequency} jam</p>
              </div>
              <div className="flex flex-col space-y-2">
                <button onClick={() => { onLog(rem.type === 'dbf' ? 'duration' : 'volume', rem.type === 'dbf' ? 600 : 120); showToast("Selesai!"); }} className="px-3 py-2 text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-xl transition text-[10px] font-bold">
                  Selesai
                </button>
                <button onClick={() => deleteReminder(rem.id)} className="p-2 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl transition flex justify-center">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-20 right-6 bg-rose-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform z-30"
      >
        <Plus size={28} />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl p-6 border-t border-slate-100 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-slate-800">Tambah Pengingat</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Tipe Aktivitas</label>
                <div className="flex space-x-2">
                  <button type="button" onClick={() => setType('dbf')} className={`flex-1 py-3 rounded-xl font-semibold transition ${type === 'dbf' ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Menyusui</button>
                  <button type="button" onClick={() => setType('pumping')} className={`flex-1 py-3 rounded-xl font-semibold transition ${type === 'pumping' ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Pumping</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Waktu Mulai</label>
                <input type="time" required value={timeStr} onChange={e => setTimeStr(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition font-mono text-lg" />
              </div>

              {type === 'pumping' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Sisi Payudara</label>
                  <select value={side} onChange={e => setSide(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition">
                    <option value="both">Keduanya</option>
                    <option value="left">Kiri</option>
                    <option value="right">Kanan</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Ulangi Setiap</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition">
                  <option value="1">1 Jam</option>
                  <option value="2">2 Jam</option>
                  <option value="3">3 Jam</option>
                  <option value="4">4 Jam</option>
                  <option value="6">6 Jam</option>
                  <option value="24">Sekali sehari</option>
                </select>
              </div>

              <button type="submit" className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 rounded-xl mt-6 shadow-lg shadow-rose-500/20 transition-all active:scale-95">Simpan Jadwal</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

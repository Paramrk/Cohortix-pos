import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Users, ShieldAlert, ArrowLeft, Delete, ArrowRight, Edit2, Mail, KeyRound } from 'lucide-react';
import type { StaffMember } from '../types';
import type { Session } from '@supabase/supabase-js';

interface AuthGateProps {
  staffMembers: StaffMember[];
  activeStaff: StaffMember | null;
  session: Session | null;
  onPinAuthenticate: (username: string, pin: string) => boolean;
  onEmailAuthenticate: (email: string, password: string) => Promise<boolean>;
  isClosable?: boolean;
  onCancel?: () => void;
}

export function AuthGate({
  staffMembers,
  activeStaff,
  session,
  onPinAuthenticate,
  onEmailAuthenticate,
  isClosable = false,
  onCancel,
}: AuthGateProps) {
  const [activeTab, setActiveTab] = useState<'pin' | 'email'>(session ? 'pin' : 'email');
  
  // PIN Login States
  const [pinStep, setPinStep] = useState<'username' | 'pin'>('username');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Email Login States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const hasOwners = staffMembers.some((s) => s.role === 'owner');

  // Reset states when switching tabs or mounting
  useEffect(() => {
    setPin('');
    setPinStep('username');
    setPinError(null);
    setEmailError(null);
    setSigningIn(false);
  }, [activeTab]);

  // Handle PIN Step 1 Username validation
  const handlePinNextStep = useCallback(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setPinError('Please enter your Username.');
      return;
    }
    setPinError(null);
    setPinStep('pin');
  }, [username]);

  // Handle PIN entry
  const handlePinKeyPress = useCallback((num: string) => {
    setPinError(null);
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      
      // Auto-submit when length reaches 4
      if (nextPin.length === 4) {
        const trimmedUser = username.trim();
        if (!trimmedUser) {
          setPinError('Please enter your Username first.');
          setPin('');
          setPinStep('username');
          return;
        }

        const success = onPinAuthenticate(trimmedUser, nextPin);
        if (success) {
          setPinError(null);
          setPin('');
          setUsername('');
          setPinStep('username');
        } else {
          setPinError('Invalid Username or PIN.');
          setPin('');
        }
      }
    }
  }, [pin, username, onPinAuthenticate]);

  const handlePinBackspace = useCallback(() => {
    setPinError(null);
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  }, [pin]);

  const handlePinClear = useCallback(() => {
    setPinError(null);
    setPin('');
  }, []);

  // Listen to physical keyboard events in the PIN step
  useEffect(() => {
    if (activeTab !== 'pin' || pinStep !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key >= '0' && e.key <= '9') {
        handlePinKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      } else if (e.key === 'Escape') {
        setPinStep('username');
        setPin('');
        setPinError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab, pinStep, handlePinKeyPress, handlePinBackspace]);

  // Handle Email & Password Login
  const handleEmailSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    const identifier = email.trim();
    const passwordValue = password.trim();
    if (!identifier || !passwordValue) {
      setEmailError('Enter your email and password.');
      return;
    }

    setSigningIn(true);
    setEmailError(null);
    try {
      await onEmailAuthenticate(identifier, passwordValue);
    } catch (err: any) {
      setEmailError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-outline-variant/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-primary-container via-secondary/10 to-primary-container/40 p-6 text-center border-b border-outline-variant/30 flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-secondary-container/20 flex items-center justify-center border border-secondary-container text-on-secondary-container mb-3 shadow-inner">
            <Lock className="w-6 h-6 text-secondary animate-pulse" />
          </div>
          
          <h2 className="text-xl font-bold font-headline text-on-surface">
            POS Staff Authentication
          </h2>
          <p className="text-xs text-on-surface-variant mt-1.5 max-w-[280px]">
            {!session && activeTab === 'pin'
              ? "Offline Mode: Enter PIN to unlock locally, or switch to Admin tab to connect database."
              : "Verify your credentials to access the POS terminal operations."
            }
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-outline-variant/30 bg-surface-container/20">
          <button
            type="button"
            onClick={() => setActiveTab('pin')}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
              activeTab === 'pin'
                ? 'border-secondary text-secondary bg-surface-container/10'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Staff PIN Login
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
              activeTab === 'email'
                ? 'border-secondary text-secondary bg-surface-container/10'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Mail className="w-4 h-4" />
            Admin Email Login
          </button>
        </div>

        {/* Tab 1: Staff PIN Login */}
        {activeTab === 'pin' && (
          <div className="flex flex-col">
            {/* Offline warning banner if session is null */}
            {!session && (
              <div className="mx-6 mt-4 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                <p className="text-[10px] font-semibold text-amber-500 leading-tight">
                  Offline Mode: Database sync inactive. Please log in as Admin to connect.
                </p>
              </div>
            )}

            {pinStep === 'username' ? (
              <div className="flex flex-col">
                <div className="px-8 pt-5">
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-secondary" /> Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setPinError(null);
                      setUsername(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePinNextStep();
                      }
                    }}
                    placeholder="Enter username (e.g. owner)"
                    className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface font-mono"
                    autoComplete="off"
                    autoFocus
                  />
                </div>

                <div className="h-6 px-8 mt-2">
                  {pinError && (
                    <p className="text-xs font-semibold text-error flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {pinError}
                    </p>
                  )}
                </div>

                <div className="px-8 pb-6">
                  <button
                    type="button"
                    onClick={handlePinNextStep}
                    className="w-full h-11 bg-primary text-on-primary hover:bg-primary/90 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-sm text-sm"
                  >
                    Continue to PIN
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {/* Active Username Pill */}
                <div className="px-8 pt-5">
                  <div className="flex justify-between items-center bg-surface-container/40 border border-outline-variant/30 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-secondary" />
                      <div className="text-left">
                        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-mono">Username</p>
                        <p className="text-sm font-bold text-on-surface font-mono">{username}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPinStep('username');
                        setPin('');
                        setPinError(null);
                      }}
                      className="p-1 rounded-lg hover:bg-surface-container text-secondary hover:text-secondary/80 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </div>
                </div>

                {/* PIN Dots */}
                <div className="px-8 pt-4 pb-2 text-center">
                  <div className="flex justify-center gap-4 mb-2">
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                          index < pin.length
                            ? 'bg-secondary border-secondary scale-110 shadow-sm shadow-secondary'
                            : 'border-outline-variant'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="h-6">
                    {pinError ? (
                      <p className="text-xs font-semibold text-error flex items-center justify-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {pinError}
                      </p>
                    ) : (
                      pin.length > 0 && <span className="text-xs text-on-surface-variant font-mono">Digit {pin.length} of 4</span>
                    )}
                  </div>
                </div>

                {/* Keypad Grid */}
                <div className="px-8 pb-6 grid grid-cols-3 gap-3">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePinKeyPress(num)}
                      className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xl font-extrabold text-on-surface transition-all scale-98 active:scale-95 duration-100 flex items-center justify-center cursor-pointer shadow-sm font-headline"
                    >
                      {num}
                    </button>
                  ))}
                  
                  <button
                    type="button"
                    onClick={handlePinBackspace}
                    className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface transition-all scale-98 active:scale-95 duration-100 flex items-center justify-center cursor-pointer shadow-sm"
                  >
                    <Delete className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePinKeyPress('0')}
                    className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xl font-extrabold text-on-surface transition-all scale-98 active:scale-95 duration-100 flex items-center justify-center cursor-pointer shadow-sm font-headline"
                  >
                    0
                  </button>

                  <button
                    type="button"
                    onClick={handlePinClear}
                    className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-all scale-98 active:scale-95 duration-100 flex items-center justify-center cursor-pointer shadow-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Admin Email Login */}
        {activeTab === 'email' && (
          <form onSubmit={handleEmailSignIn} className="px-8 py-6 space-y-4">
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Admin/Staff Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmailError(null);
                  setEmail(e.target.value);
                }}
                className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                placeholder="Enter staff email"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setEmailError(null);
                  setPassword(e.target.value);
                }}
                className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>

            {emailError && (
              <p className="text-xs font-semibold text-error bg-error/10 border border-error/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {emailError}
              </p>
            )}

            <button
              type="submit"
              disabled={signingIn}
              className="w-full h-11 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary/90 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-sm text-sm"
            >
              <LogInIcon className="w-4 h-4" />
              {signingIn ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Action Footers */}
        {isClosable && onCancel && (
          <div className="px-6 py-4 bg-surface-container/50 border-t border-outline-variant/30 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="h-10 px-4 rounded-xl border border-outline-variant hover:bg-surface-container text-xs font-bold text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Cancel & Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple LogIn icon wrapper to avoid name collision
function LogInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

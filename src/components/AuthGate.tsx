import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Users, ShieldAlert, ArrowLeft, Delete, ArrowRight, Edit2 } from 'lucide-react';
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
  // Navigation Steps: username (Step 1) -> pin or password (Step 2)
  const [step, setStep] = useState<'username' | 'credential'>('username');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  
  // PIN Login States
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Email Login States
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const hasOwners = staffMembers.some((s) => s.role === 'owner');
  const isEmailInput = usernameOrEmail.includes('@') && usernameOrEmail.includes('.');

  // Reset states when mounting or locking
  useEffect(() => {
    setPin('');
    setPassword('');
    setPinError(null);
    setEmailError(null);
    setStep('username');
  }, []);

  // Handle Username / Email validation (Step 1 -> Step 2 transition)
  const handleNextStep = useCallback(() => {
    const trimmed = usernameOrEmail.trim();
    if (!trimmed) {
      setPinError('Please enter your Username or Email.');
      return;
    }
    setPinError(null);
    setEmailError(null);
    setPin('');
    setPassword('');
    setStep('credential');
  }, [usernameOrEmail]);

  // Handle PIN entry
  const handlePinKeyPress = useCallback((num: string) => {
    setPinError(null);
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      
      // Auto-submit when length reaches 4
      if (nextPin.length === 4) {
        const trimmedUser = usernameOrEmail.trim();
        if (!trimmedUser) {
          setPinError('Please enter your Username first.');
          setPin('');
          setStep('username');
          return;
        }

        const success = onPinAuthenticate(trimmedUser, nextPin);
        if (success) {
          setPinError(null);
          setPin('');
          setUsernameOrEmail('');
          setStep('username');
        } else {
          setPinError('Invalid Username or PIN.');
          setPin('');
        }
      }
    }
  }, [pin, usernameOrEmail, onPinAuthenticate]);

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

  // Listen to physical keyboard events in the PIN step (only if not email mode)
  useEffect(() => {
    if (step !== 'credential' || isEmailInput) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key >= '0' && e.key <= '9') {
        handlePinKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      } else if (e.key === 'Escape') {
        setStep('username');
        setPin('');
        setPinError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [step, isEmailInput, handlePinKeyPress, handlePinBackspace]);

  // Handle Email & Password Login
  const handleEmailSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    const identifier = usernameOrEmail.trim();
    const passwordValue = password.trim();
    if (!passwordValue) {
      setEmailError('Enter your password.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
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
            {!session && step === 'username'
              ? "Offline Mode: Connect database by entering Admin email, or log in locally with PIN."
              : "Enter your username/email and credentials to unlock the terminal."
            }
          </p>
        </div>

        {/* STEP 1: Enter Username or Email */}
        {step === 'username' && (
          <div className="flex flex-col">
            {/* Offline warning banner if session is null */}
            {!session && (
              <div className="mx-6 mt-4 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                <p className="text-[10px] font-semibold text-amber-500 leading-tight">
                  Offline Mode: Database sync inactive. Log in using email to restore sync.
                </p>
              </div>
            )}

            <div className="px-8 pt-6">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-secondary" /> Username or Email
              </label>
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => {
                  setPinError(null);
                  setUsernameOrEmail(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNextStep();
                  }
                }}
                placeholder="Enter username or email"
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
                onClick={handleNextStep}
                className="w-full h-11 bg-primary text-on-primary hover:bg-primary/90 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-sm text-sm"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Enter PIN or Password */}
        {step === 'credential' && (
          <div className="flex flex-col">
            {/* Active Username Indicator */}
            <div className="px-8 pt-6">
              <div className="flex justify-between items-center bg-surface-container/40 border border-outline-variant/30 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-secondary" />
                  <div className="text-left">
                    <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-mono">
                      {isEmailInput ? 'Admin Email' : 'Staff Username'}
                    </p>
                    <p className="text-sm font-bold text-on-surface font-mono truncate max-w-[200px]" title={usernameOrEmail}>
                      {usernameOrEmail}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('username');
                    setPin('');
                    setPassword('');
                    setPinError(null);
                    setEmailError(null);
                  }}
                  className="p-1 rounded-lg hover:bg-surface-container text-secondary hover:text-secondary/80 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer border border-transparent hover:border-outline-variant/30"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            </div>

            {isEmailInput ? (
              /* Email Password Input View */
              <form onSubmit={handleEmailSignIn} className="px-8 pt-4 pb-6 space-y-4">
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
                    placeholder="Enter your password"
                    className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>

                {emailError && (
                  <p className="text-xs font-semibold text-error flex items-center gap-1.5 bg-error/10 border border-error/20 rounded-xl px-3 py-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {emailError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full h-11 bg-primary text-on-primary hover:bg-primary/90 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-sm text-sm"
                >
                  {signingIn ? 'Signing In...' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* Staff PIN Keypad View */
              <div className="flex flex-col">
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

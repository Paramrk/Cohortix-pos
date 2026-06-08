import React, { useState, useEffect, useCallback } from 'react';
import { X, ShieldAlert, Key, User, Mail, ShieldCheck, Clock, Send, Lock } from 'lucide-react';
import type { StaffMember } from '../types';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface ProfileModalProps {
  activeStaff: StaffMember;
  session: Session | null;
  onUpdateProfile: (id: string, updates: Partial<StaffMember>) => Promise<void>;
  onClose: () => void;
  onSwitchStaff: () => void;
}

export function ProfileModal({
  activeStaff,
  session,
  onUpdateProfile,
  onClose,
  onSwitchStaff,
}: ProfileModalProps) {
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>(
    activeStaff.role === 'owner' && session ? 'profile' : 'profile'
  );

  // General Profile States
  const [name, setName] = useState(activeStaff.name);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Email Change States
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // 1-Week Check for Email Change
  const lastEmailChange = session?.user?.user_metadata?.last_email_change;
  
  const getEmailChangeLimitStatus = useCallback(() => {
    if (!lastEmailChange) return { allowed: true };
    const lastDate = new Date(lastEmailChange);
    const nextAllowedDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now < nextAllowedDate) {
      return { allowed: false, nextDate: nextAllowedDate };
    }
    return { allowed: true };
  }, [lastEmailChange]);

  const limitStatus = getEmailChangeLimitStatus();

  // Reset errors and messages on section switch
  useEffect(() => {
    setProfileError(null);
    setProfileSuccess(null);
    setEmailError(null);
    setEmailSuccess(null);
    setConfirmPin('');
    setNewPin('');
    setCurrentPin('');
  }, [activeSection]);

  // Handle General Profile Update (Name & PIN)
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setProfileError('Display Name cannot be empty.');
      return;
    }

    const updates: Partial<StaffMember> = {};
    if (cleanName !== activeStaff.name) {
      updates.name = cleanName;
    }

    // PIN Update Request
    if (newPin || currentPin || confirmPin) {
      if (currentPin !== activeStaff.pin) {
        setProfileError('Current PIN is incorrect.');
        return;
      }
      if (!/^\d{4}$/.test(newPin)) {
        setProfileError('New PIN must be exactly 4 digits.');
        return;
      }
      if (newPin !== confirmPin) {
        setProfileError('New PIN and Confirm PIN do not match.');
        return;
      }
      if (newPin === '0000') {
        setProfileError('PIN "0000" is reserved for bootstrap configuration.');
        return;
      }
      updates.pin = newPin;
    }

    if (Object.keys(updates).length === 0) {
      setProfileError('No changes detected.');
      return;
    }

    setUpdatingProfile(true);
    try {
      await onUpdateProfile(activeStaff.id, updates);
      setProfileSuccess('Profile updated successfully!');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  // Handle Email Change Request
  const handleEmailChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    const targetEmail = newEmail.trim();
    if (!targetEmail || !targetEmail.includes('@') || !targetEmail.includes('.')) {
      setEmailError('Enter a valid new email address.');
      return;
    }

    if (targetEmail.toLowerCase() === session?.user?.email?.toLowerCase()) {
      setEmailError('New email is the same as your current email.');
      return;
    }

    if (!limitStatus.allowed) {
      setEmailError(`You can only change the email once a week.`);
      return;
    }

    setSendingRequest(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: targetEmail });
      if (error) throw error;
      
      setEmailStep('verify');
      setEmailSuccess(`Verification code sent to ${targetEmail}. Please check your inbox.`);
    } catch (err: any) {
      setEmailError(err.message || 'Failed to request email change.');
    } finally {
      setSendingRequest(false);
    }
  };

  // Handle Email OTP Verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    const trimmedOtp = otp.trim();
    if (!/^\d{6}$/.test(trimmedOtp)) {
      setEmailError('Verification code must be 6 digits.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: newEmail.trim(),
        token: trimmedOtp,
        type: 'email_change',
      });
      if (verifyError) throw verifyError;

      // Log last changed timestamp to user_metadata
      const { error: updateMetaError } = await supabase.auth.updateUser({
        data: {
          last_email_change: new Date().toISOString(),
        },
      });
      if (updateMetaError) throw updateMetaError;

      setEmailSuccess('Email updated successfully! Use your new email for future logins.');
      setNewEmail('');
      setOtp('');
      setEmailStep('request');
    } catch (err: any) {
      setEmailError(err.message || 'Verification failed. Double check the code and try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-surface border border-outline-variant/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-outline-variant/30 flex justify-between items-center bg-gradient-to-r from-primary-container/30 to-surface">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-secondary" />
            <h2 className="text-lg font-bold font-headline text-on-surface">Profile Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection (Owner & Authenticated Session only) */}
        {activeStaff.role === 'owner' && session && (
          <div className="flex border-b border-outline-variant/20 bg-surface-container/20">
            <button
              type="button"
              onClick={() => setActiveSection('profile')}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeSection === 'profile'
                  ? 'border-secondary text-secondary bg-surface-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              General Details
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('security')}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeSection === 'security'
                  ? 'border-secondary text-secondary bg-surface-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Admin Email Security
            </button>
          </div>
        )}

        {/* Section 1: General Details Form */}
        {activeSection === 'profile' && (
          <form onSubmit={handleProfileUpdate} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Username (Read Only)
                </label>
                <input
                  type="text"
                  value={activeStaff.username}
                  className="w-full h-10 px-3 border border-outline-variant/40 bg-surface-container/40 rounded-xl text-sm text-on-surface-variant font-mono focus:outline-none"
                  disabled
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                />
              </div>
            </div>

            <div className="border-t border-outline-variant/40 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-on-surface font-headline uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-secondary" /> Change PIN Code
              </h4>
              <p className="text-[10px] text-on-surface-variant">
                Leave these fields blank if you do not want to modify your login PIN.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full h-10 px-3 text-center border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm font-mono text-on-surface"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    New PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full h-10 px-3 text-center border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm font-mono text-on-surface"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Confirm PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full h-10 px-3 text-center border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm font-mono text-on-surface"
                  />
                </div>
              </div>
            </div>

            {profileError && (
              <p className="text-xs font-semibold text-error bg-error/10 border border-error/20 rounded-xl px-3 py-2 flex items-center gap-1.5 animate-pulse">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {profileError}
              </p>
            )}

            {profileSuccess && (
              <p className="text-xs font-semibold text-secondary bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {profileSuccess}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onSwitchStaff}
                className="flex-1 h-11 rounded-xl border border-outline-variant hover:bg-surface-container text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-transparent"
              >
                <Lock className="w-3.5 h-3.5 text-secondary" />
                Switch User / Lock
              </button>
              <button
                type="submit"
                disabled={updatingProfile}
                className="flex-1 h-11 rounded-xl bg-secondary text-on-secondary font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs transition-all shadow-sm cursor-pointer"
              >
                {updatingProfile ? 'Updating...' : 'Update Details'}
              </button>
            </div>
          </form>
        )}

        {/* Section 2: Admin Email Security Form */}
        {activeSection === 'security' && activeStaff.role === 'owner' && session && (
          <div className="p-6 space-y-4">
            <div className="bg-surface-container/30 border border-outline-variant/30 rounded-xl p-3 flex flex-col space-y-1 text-xs">
              <span className="text-on-surface-variant">Current Registered Email</span>
              <span className="font-bold text-on-surface font-mono text-sm">{session.user?.email}</span>
            </div>

            {/* Change Frequency Restriction Alert */}
            {!limitStatus.allowed && limitStatus.nextDate && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-medium text-amber-800 flex items-start gap-2">
                <Clock className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Email Change Limit Reached</p>
                  <p className="mt-0.5 text-on-surface-variant leading-relaxed">
                    You can only change the admin email address once per week. You will be allowed to update it again on:
                  </p>
                  <p className="mt-1 font-bold text-amber-900">
                    {limitStatus.nextDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Email update inputs */}
            {limitStatus.allowed && emailStep === 'request' && (
              <form onSubmit={handleEmailChangeRequest} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    New Email Address
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => {
                      setEmailError(null);
                      setNewEmail(e.target.value);
                    }}
                    placeholder="Enter new email address"
                    className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                    required
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
                  disabled={sendingRequest}
                  className="w-full h-11 rounded-xl bg-secondary text-on-secondary font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs transition-all shadow-sm cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingRequest ? 'Sending Verification...' : 'Send Verification OTP'}
                </button>
              </form>
            )}

            {/* OTP Verification Step */}
            {emailStep === 'verify' && (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Verification OTP
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    pattern="\d*"
                    value={otp}
                    onChange={(e) => {
                      setEmailError(null);
                      setOtp(e.target.value.replace(/\D/g, ''));
                    }}
                    placeholder="Enter 6-digit code"
                    className="w-full h-11 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-center font-mono font-bold tracking-widest text-on-surface"
                    required
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1.5">
                    Enter the code sent to your new email: <strong className="font-mono text-on-surface">{newEmail}</strong>
                  </p>
                </div>

                {emailError && (
                  <p className="text-xs font-semibold text-error flex items-center gap-1.5 bg-error/10 border border-error/20 rounded-xl px-3 py-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {emailError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailStep('request');
                      setOtp('');
                      setEmailError(null);
                    }}
                    className="flex-1 h-11 rounded-xl border border-outline-variant hover:bg-surface-container text-on-surface font-semibold text-xs transition-all cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={verifyingOtp}
                    className="flex-1 h-11 rounded-xl bg-secondary text-on-secondary font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs transition-all shadow-sm cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {verifyingOtp ? 'Verifying...' : 'Verify & Update'}
                  </button>
                </div>
              </form>
            )}

            {emailSuccess && (
              <p className="text-xs font-semibold text-secondary bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {emailSuccess}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

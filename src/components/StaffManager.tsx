import React, { useState } from 'react';
import { UserPlus, Shield, Check, X, ShieldAlert, Lock, Trash2, Key, Users, User } from 'lucide-react';
import type { StaffMember, StaffPermissions } from '../types';
import { DEFAULT_STAFF_PERMISSIONS } from '../store';

interface StaffManagerProps {
  staffMembers: StaffMember[];
  activeStaff: StaffMember | null;
  onAdd: (name: string, username: string, pin: string, role: 'owner' | 'staff', permissions: StaffPermissions) => Promise<void>;
  onUpdate: (id: string, updates: Partial<StaffMember>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditProfile?: () => void;
}

export function StaffManager({
  staffMembers,
  activeStaff,
  onAdd,
  onUpdate,
  onDelete,
  onEditProfile,
}: StaffManagerProps) {
  const [name, setName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('staff');
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMISSIONS });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePin = (val: string) => {
    return /^\d{4}$/.test(val);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Staff name cannot be empty.');
      return;
    }

    const cleanUsername = usernameInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanUsername) {
      setError('Username cannot be empty.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setError('Username can only contain alphanumeric characters and underscores.');
      return;
    }

    if (!validatePin(pin)) {
      setError('PIN must be exactly 4 digits (numeric).');
      return;
    }

    // Check duplicate PIN
    const isPinDuplicate = staffMembers.some((s) => s.pin === pin);
    if (isPinDuplicate || pin === '0000') {
      setError('This PIN is already assigned to another staff member.');
      return;
    }

    // Check duplicate Username
    const isUsernameDuplicate = staffMembers.some((s) => s.username.toLowerCase() === cleanUsername);
    if (isUsernameDuplicate || cleanUsername === 'owner') {
      setError('This Username is already taken.');
      return;
    }

    try {
      await onAdd(trimmedName, cleanUsername, pin, role, permissions);
      setName('');
      setUsernameInput('');
      setPin('');
      setRole('staff');
      setPermissions({ ...DEFAULT_STAFF_PERMISSIONS });
      setShowAddForm(false);
    } catch (err) {
      setError('Failed to create staff member.');
    }
  };

  const handleToggleModule = (modKey: keyof StaffPermissions['modules'], isEdit = false, staffId?: string) => {
    if (isEdit && staffId) {
      const staff = staffMembers.find((s) => s.id === staffId);
      if (staff) {
        const nextMods = { ...staff.permissions.modules, [modKey]: !staff.permissions.modules[modKey] };
        void onUpdate(staffId, {
          permissions: {
            ...staff.permissions,
            modules: nextMods,
          },
        });
      }
    } else {
      setPermissions((prev) => ({
        ...prev,
        modules: {
          ...prev.modules,
          [modKey]: !prev.modules[modKey],
        },
      }));
    }
  };

  const handleToggleMetric = (metricKey: keyof StaffPermissions['metrics'], isEdit = false, staffId?: string) => {
    if (isEdit && staffId) {
      const staff = staffMembers.find((s) => s.id === staffId);
      if (staff) {
        const nextMetrics = { ...staff.permissions.metrics, [metricKey]: !staff.permissions.metrics[metricKey] };
        void onUpdate(staffId, {
          permissions: {
            ...staff.permissions,
            metrics: nextMetrics,
          },
        });
      }
    } else {
      setPermissions((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          [metricKey]: !prev.metrics[metricKey],
        },
      }));
    }
  };

  const handleRoleChange = (newRole: 'owner' | 'staff', isEdit = false, staffId?: string) => {
    if (isEdit && staffId) {
      void onUpdate(staffId, { role: newRole });
    } else {
      setRole(newRole);
    }
  };

  const handleNameChange = (newName: string, staffId: string) => {
    void onUpdate(staffId, { name: newName });
  };

  const handleUsernameChange = (newUsername: string, staffId: string) => {
    const cleanUsername = newUsername.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanUsername) {
      alert('Username cannot be empty.');
      return;
    }
    const isDuplicate = staffMembers.some((s) => s.id !== staffId && s.username.toLowerCase() === cleanUsername);
    if (isDuplicate || cleanUsername === 'owner') {
      alert('Username is already taken.');
      return;
    }
    void onUpdate(staffId, { username: cleanUsername });
  };

  const handlePinChange = (newPin: string, staffId: string) => {
    if (validatePin(newPin)) {
      const isDuplicate = staffMembers.some((s) => s.id !== staffId && s.pin === newPin);
      if (isDuplicate || newPin === '0000') {
        alert('PIN is already in use by another staff member.');
        return;
      }
      void onUpdate(staffId, { pin: newPin });
    } else {
      alert('PIN must be exactly 4 digits (numeric).');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (activeStaff && activeStaff.id === id) {
      alert('Cannot delete the active logged-in staff member.');
      return;
    }
    const confirmed = window.confirm(`Are you sure you want to permanently delete staff member "${name}"?`);
    if (!confirmed) return;
    
    try {
      await onDelete(id);
    } catch (err) {
      alert('Failed to delete staff member.');
    }
  };

  return (
    <div className="mobile-bottom-offset md:pb-0 max-w-6xl mx-auto space-y-6">
      
      {/* Header card */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-on-surface font-headline flex items-center gap-2">
            <Users className="w-6 h-6 text-secondary" />
            Staff Management
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Configure POS staff profiles, role permissions, and access rights.
          </p>
        </div>
        
        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
          }}
          className="h-10 px-4 rounded-xl bg-secondary text-on-secondary hover:opacity-90 font-bold transition-all scale-98 active:scale-95 flex items-center gap-2 text-xs shadow-sm cursor-pointer"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {showAddForm ? 'Cancel Adding' : 'Add Staff Member'}
        </button>
      </div>

      {/* Add Staff form */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4 max-w-2xl">
          <h3 className="text-sm font-bold text-on-surface font-headline uppercase tracking-wider flex items-center gap-1.5">
            <UserPlus className="w-4.5 h-4.5 text-secondary" />
            Create New Staff Profile
          </h3>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul, Sneha"
                className="w-full h-10 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. rahul_sales"
                className="w-full h-10 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface font-mono"
                required
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                4-Digit PIN
              </label>
              <input
                type="text"
                pattern="\d*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 1234"
                className="w-full h-10 px-4 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value as 'owner' | 'staff')}
                className="w-full h-10 px-3 border border-outline-variant bg-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary text-sm text-on-surface"
              >
                <option value="staff">Staff (Limited Access)</option>
                <option value="owner">Owner (Full Access)</option>
              </select>
            </div>
          </div>

          {role === 'staff' && (
            <div className="border-t border-outline-variant/60 pt-4 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-on-surface mb-2 font-headline uppercase tracking-wider">
                  Module-Based Access Control
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'new-order', label: 'New Order' },
                    { key: 'queue', label: 'Order Queue' },
                    { key: 'dashboard', label: 'Dashboard/Stats' },
                    { key: 'menu', label: 'Menu Manager' },
                  ].map((mod) => (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => handleToggleModule(mod.key as any)}
                      className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                        permissions.modules[mod.key as keyof StaffPermissions['modules']]
                          ? 'bg-secondary/10 border-secondary text-secondary font-bold'
                          : 'border-outline-variant bg-surface text-on-surface-variant'
                      }`}
                    >
                      <span>{mod.label}</span>
                      {permissions.modules[mod.key as keyof StaffPermissions['modules']] ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-on-surface mb-2 font-headline uppercase tracking-wider">
                  Stats Metrics Visibility Control
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {[
                    { key: 'todaySales', label: "Today's Sales" },
                    { key: 'expenses', label: 'Expenses Total' },
                    { key: 'netProfit', label: 'Net Profit' },
                    { key: 'totalOrders', label: 'Total Orders Count' },
                    { key: 'avgOrderValue', label: 'Average Order Val' },
                    { key: 'paymentBreakdown', label: 'Payment Breakdown' },
                    { key: 'orderFlow', label: 'Order Flow Breakdown' },
                    { key: 'collectionHealth', label: 'Collection Health' },
                    { key: 'productHighlights', label: 'Product highlights' },
                    { key: 'detailedOrders', label: 'Detailed Orders List' },
                    { key: 'expenseManagement', label: 'Add/Log Expenses' },
                  ].map((met) => (
                    <button
                      key={met.key}
                      type="button"
                      onClick={() => handleToggleMetric(met.key as any)}
                      className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                        permissions.metrics[met.key as keyof StaffPermissions['metrics']]
                          ? 'bg-secondary/10 border-secondary text-secondary font-bold'
                          : 'border-outline-variant bg-surface text-on-surface-variant'
                      }`}
                    >
                      <span className="truncate">{met.label}</span>
                      {permissions.metrics[met.key as keyof StaffPermissions['metrics']] ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="h-11 px-5 rounded-xl bg-secondary text-on-secondary font-bold hover:opacity-95 text-xs shadow-sm cursor-pointer"
          >
            Create Profile
          </button>
        </form>
      )}

      {/* Staff list cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {staffMembers.length === 0 ? (
          <div className="md:col-span-2 text-center py-16 bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <Lock className="w-8 h-8 text-outline mx-auto mb-2" />
            <p className="font-semibold text-sm text-on-surface">No staff members configured yet.</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Add staff members using the button above to assign role permissions.
            </p>
          </div>
        ) : (
          staffMembers.map((staff) => {
            const isSelf = activeStaff?.id === staff.id;
            return (
              <div
                key={staff.id}
                className={`bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col ${
                  isSelf ? 'ring-2 ring-secondary' : ''
                }`}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-outline-variant/60 flex justify-between items-center bg-surface-container/30">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant">
                      <Shield className="w-4 h-4 text-secondary" />
                    </div>
                    <div>
                      <input
                        type="text"
                        defaultValue={staff.name}
                        onBlur={(e) => handleNameChange(e.target.value, staff.id)}
                        className="font-bold text-sm text-on-surface bg-transparent border-b border-transparent focus:border-secondary focus:outline-none"
                      />
                      <p className="text-[10px] text-on-surface-variant font-mono">ID: {staff.id.substring(0, 8)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isSelf && onEditProfile && (
                      <button
                        type="button"
                        onClick={onEditProfile}
                        className="h-7 px-2.5 rounded-lg border border-secondary bg-secondary/10 hover:bg-secondary/20 text-secondary flex items-center justify-center gap-1 text-[10px] font-bold transition-all cursor-pointer"
                        title="Edit profile & email options"
                      >
                        <User className="w-3 h-3" />
                        Edit Profile
                      </button>
                    )}
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      staff.role === 'owner' 
                        ? 'bg-secondary-container text-on-secondary-container' 
                        : 'bg-surface-variant text-on-surface-variant'
                    }`}>
                      {staff.role}
                    </span>
                    
                    <button
                      type="button"
                      onClick={() => handleDelete(staff.id, staff.name)}
                      disabled={isSelf}
                      className="p-1.5 rounded-lg border border-outline-variant text-error hover:bg-rose-50 hover:border-rose-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                      title={isSelf ? 'Cannot delete yourself' : 'Delete Staff Profile'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 space-y-4">
                  {/* Username Section */}
                  <div className="flex items-center justify-between text-xs border-b border-outline-variant/30 pb-3">
                    <span className="font-semibold text-on-surface-variant flex items-center gap-1 font-mono uppercase tracking-wider text-[10px]">
                      <Users className="w-3.5 h-3.5 text-secondary" /> Username
                    </span>
                    <input
                      type="text"
                      defaultValue={staff.username}
                      onBlur={(e) => handleUsernameChange(e.target.value, staff.id)}
                      className="w-32 h-8 px-2 text-right bg-surface border border-outline-variant rounded-lg font-mono font-bold text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>

                  {/* PIN Section */}
                  <div className="flex items-center justify-between text-xs border-b border-outline-variant/30 pb-3">
                    <span className="font-semibold text-on-surface-variant flex items-center gap-1 font-mono uppercase tracking-wider text-[10px]">
                      <Key className="w-3.5 h-3.5 text-secondary" /> PIN Code
                    </span>
                    <input
                      type="text"
                      maxLength={4}
                      defaultValue={staff.pin}
                      onBlur={(e) => handlePinChange(e.target.value, staff.id)}
                      className="w-16 h-8 text-center bg-surface border border-outline-variant rounded-lg font-mono font-bold text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>

                  {/* Permissions Settings */}
                  {staff.role === 'owner' ? (
                    <div className="bg-secondary-container/10 border border-secondary/20 rounded-xl p-3 text-center flex flex-col items-center gap-2">
                      <div>
                        <p className="text-xs font-semibold text-on-secondary-container">
                          Full Owner Permissions Granted
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Owners always have complete access to all modules and metrics.
                        </p>
                      </div>
                      {isSelf && onEditProfile && (
                        <button
                          type="button"
                          onClick={onEditProfile}
                          className="h-8 px-4 rounded-xl bg-secondary text-on-secondary hover:opacity-90 font-bold transition-all flex items-center justify-center gap-1.5 text-xs shadow-sm cursor-pointer w-full mt-1"
                        >
                          <User className="w-3.5 h-3.5" />
                          Edit Profile & Security
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                          Module Toggles
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { key: 'new-order', label: 'Order' },
                            { key: 'queue', label: 'Queue' },
                            { key: 'dashboard', label: 'Stats' },
                            { key: 'menu', label: 'Menu' },
                          ].map((mod) => (
                            <button
                              key={`staff-${staff.id}-${mod.key}`}
                              type="button"
                              onClick={() => handleToggleModule(mod.key as any, true, staff.id)}
                              className={`h-7 px-2.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                                staff.permissions.modules[mod.key as keyof StaffPermissions['modules']]
                                  ? 'bg-secondary/10 border-secondary text-secondary'
                                  : 'border-outline-variant bg-surface text-on-surface-variant'
                              }`}
                            >
                              {mod.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                          Metrics Visibility ({Object.values(staff.permissions.metrics).filter(Boolean).length}/11)
                        </p>
                        <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
                          {[
                            { key: 'todaySales', label: 'Sales' },
                            { key: 'expenses', label: 'Exp Total' },
                            { key: 'netProfit', label: 'Profit' },
                            { key: 'totalOrders', label: 'Orders' },
                            { key: 'avgOrderValue', label: 'AOV' },
                            { key: 'paymentBreakdown', label: 'Payments' },
                            { key: 'orderFlow', label: 'Flow' },
                            { key: 'collectionHealth', label: 'Health' },
                            { key: 'productHighlights', label: 'Products' },
                            { key: 'detailedOrders', label: 'List' },
                            { key: 'expenseManagement', label: 'Manage Exp' },
                          ].map((met) => (
                            <button
                              key={`staff-${staff.id}-${met.key}`}
                              type="button"
                              onClick={() => handleToggleMetric(met.key as any, true, staff.id)}
                              className={`h-7 px-2.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                                staff.permissions.metrics[met.key as keyof StaffPermissions['metrics']]
                                  ? 'bg-secondary/10 border-secondary text-secondary'
                                  : 'border-outline-variant bg-surface text-on-surface-variant'
                              }`}
                            >
                              {met.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

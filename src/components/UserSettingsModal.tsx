import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, AlertCircle, CheckCircle, Eye, EyeOff, User, ImagePlus } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { compressForUpload } from '../utils/clientImageProcessing';
import { AVATAR_OUTPUT_SIZE, createAvatarBlob, type Area } from '../utils/avatarCropper';

interface UserSettingsModalProps {
  onClose: () => void;
}

type ActiveTab = 'profile' | 'password';

/**
 * UserSettingsModal - Modal for user account settings
 * 
 * Currently supports:
 * - Password change (via Supabase Auth)
 * 
 * Future expansion:
 * - Email preferences
 * - Notification settings
 * - Privacy settings
 */
export default function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('password');

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-4 pb-6 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col"
        role="dialog"
        aria-labelledby="settings-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="settings-modal-title" className="text-lg font-semibold text-slate-900">
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 
                       hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('password')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors
                        ${activeTab === 'password'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
          >
            <Lock size={16} />
            Password
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors
                        ${activeTab === 'profile'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
          >
            <User size={16} />
            Profile
          </button>
          {/* Future tabs can be added here */}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {activeTab === 'profile' && <ProfileSettingsForm />}
          {activeTab === 'password' && <PasswordChangeForm />}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }

  return createPortal(modal, document.body);
}

function isSupportedAvatarFile(file: File): boolean {
  const type = file.type?.toLowerCase() || ''
  const name = file.name?.toLowerCase() || ''
  if (type.startsWith('image/')) return true
  return name.endsWith('.heic') || name.endsWith('.heif')
}

function ProfileSettingsForm() {
  const { profile, updateProfile, updateAvatar } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [username, setUsername] = useState(profile?.username ?? '')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameSuccess, setUsernameSuccess] = useState(false)
  const [isSavingUsername, setIsSavingUsername] = useState(false)

  const [avatarSourceUrl, setAvatarSourceUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarSuccess, setAvatarSuccess] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  useEffect(() => {
    setUsername(profile?.username ?? '')
  }, [profile?.username])

  useEffect(() => {
    return () => {
      if (avatarSourceUrl) {
        URL.revokeObjectURL(avatarSourceUrl)
      }
    }
  }, [avatarSourceUrl])

  const currentAvatarUrl = useMemo(() => profile?.avatar_url ?? null, [profile?.avatar_url])

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUsernameError(null)
    setUsernameSuccess(false)

    const trimmed = username.trim()
    if (trimmed.length < 3) {
      setUsernameError('Username must be at least 3 characters')
      return
    }
    if (trimmed.length > 30) {
      setUsernameError('Username must be at most 30 characters')
      return
    }
    if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
      setUsernameError('Username may only contain letters, numbers, and underscores')
      return
    }

    setIsSavingUsername(true)
    const result = await updateProfile(trimmed)
    setIsSavingUsername(false)
    if (!result.success) {
      setUsernameError(result.error)
      return
    }
    setUsernameSuccess(true)
  }

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarError(null)
    setAvatarSuccess(false)

    if (!isSupportedAvatarFile(file)) {
      setAvatarError('Please select a valid image file')
      return
    }

    try {
      const processed = await compressForUpload(file, { maxSize: 2048, quality: 0.92 })
      const normalizedFile = new File([processed.blob], `avatar-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      })
      if (avatarSourceUrl) {
        URL.revokeObjectURL(avatarSourceUrl)
      }
      setAvatarSourceUrl(URL.createObjectURL(normalizedFile))
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to prepare image')
    }
  }

  const handleAvatarUpload = async () => {
    if (!avatarSourceUrl || !croppedAreaPixels) {
      setAvatarError('Please select and crop an image first')
      return
    }

    setIsUploadingAvatar(true)
    setAvatarError(null)
    setAvatarSuccess(false)

    try {
      const blob = await createAvatarBlob(avatarSourceUrl, croppedAreaPixels, AVATAR_OUTPUT_SIZE, 0.9)
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const result = await updateAvatar(file)
      if (!result.success) {
        setAvatarError(result.error)
        setIsUploadingAvatar(false)
        return
      }
      setAvatarSuccess(true)
      setAvatarSourceUrl(null)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to update avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Profile</h3>
        <p className="text-xs text-slate-500">Update your display name and avatar photo.</p>
      </div>

      {/* Avatar Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-lg font-semibold text-slate-600">
            {currentAvatarUrl ? (
              <img src={currentAvatarUrl} alt="Current avatar" className="w-full h-full object-cover" />
            ) : (
              (profile?.username?.[0] || 'U').toUpperCase()
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800">Avatar</p>
            <p className="text-xs text-slate-500">Best results use a clear face photo.</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={handleAvatarFileChange}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700
                     bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <ImagePlus size={16} />
          Choose Image
        </button>

        {avatarSourceUrl && (
          <div className="space-y-3">
            <div className="relative w-full h-64 bg-slate-900 rounded-xl overflow-hidden">
              <Cropper
                image={avatarSourceUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_: Area, croppedPixels: Area) => setCroppedAreaPixels(croppedPixels)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-slate-500">{zoom.toFixed(1)}x</span>
            </div>
            <p className="text-xs text-slate-500">
              Drag to center your avatar. Output size: {AVATAR_OUTPUT_SIZE}×{AVATAR_OUTPUT_SIZE}px.
            </p>
            <button
              type="button"
              onClick={handleAvatarUpload}
              disabled={isUploadingAvatar}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium
                         text-white bg-blue-600 hover:bg-blue-700
                         disabled:bg-slate-300 disabled:cursor-not-allowed
                         rounded-lg transition-colors"
            >
              {isUploadingAvatar ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving Avatar...
                </>
              ) : (
                'Save Avatar'
              )}
            </button>
          </div>
        )}

        {avatarError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{avatarError}</span>
          </div>
        )}

        {avatarSuccess && (
          <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            <CheckCircle size={16} className="flex-shrink-0" />
            <span>Avatar updated successfully.</span>
          </div>
        )}
      </div>

      {/* Username Section */}
      <form onSubmit={handleUsernameSubmit} className="space-y-3">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter a username"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900
                       placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoComplete="username"
          />
        </div>
        <p className="text-xs text-slate-500">Letters, numbers, and underscores only (3–30 characters).</p>

        {usernameError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{usernameError}</span>
          </div>
        )}

        {usernameSuccess && (
          <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            <CheckCircle size={16} className="flex-shrink-0" />
            <span>Username updated successfully.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSavingUsername}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium
                     text-white bg-blue-600 hover:bg-blue-700
                     disabled:bg-slate-300 disabled:cursor-not-allowed
                     rounded-lg transition-colors"
        >
          {isSavingUsername ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Updating...
            </>
          ) : (
            'Update Username'
          )}
        </button>
      </form>
    </div>
  )
}

/**
 * PasswordChangeForm - Form for changing user password
 */
function PasswordChangeForm() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const MIN_PASSWORD_LENGTH = 8;

  const validatePassword = (): string | null => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match';
    }
    // Check for at least one number and one letter
    if (!/[0-9]/.test(newPassword)) {
      return 'Password must contain at least one number';
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      return 'Password must contain at least one letter';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="py-8 text-center">
        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Password Updated!
        </h3>
        <p className="text-sm text-slate-500">
          Your password has been changed successfully.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-500 mb-4">
        Choose a strong password with at least 8 characters, including letters and numbers.
      </p>

      {/* New Password */}
      <div>
        <label 
          htmlFor="new-password"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          New Password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg
                       text-sm text-slate-900 placeholder:text-slate-400
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 
                       hover:text-slate-600 rounded transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Confirm Password */}
      <div>
        <label 
          htmlFor="confirm-password"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Confirm Password
        </label>
        <input
          id="confirm-password"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg
                     text-sm text-slate-900 placeholder:text-slate-400
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          autoComplete="new-password"
        />
      </div>

      {/* Password strength indicator */}
      {newPassword && (
        <div className="text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-500">Password strength:</span>
            <PasswordStrengthIndicator password={newPassword} />
          </div>
          <ul className="text-slate-500 space-y-0.5 ml-1">
            <li className={newPassword.length >= MIN_PASSWORD_LENGTH ? 'text-green-600' : ''}>
              {newPassword.length >= MIN_PASSWORD_LENGTH ? '✓' : '○'} At least 8 characters
            </li>
            <li className={/[a-zA-Z]/.test(newPassword) ? 'text-green-600' : ''}>
              {/[a-zA-Z]/.test(newPassword) ? '✓' : '○'} Contains a letter
            </li>
            <li className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>
              {/[0-9]/.test(newPassword) ? '✓' : '○'} Contains a number
            </li>
          </ul>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || !newPassword || !confirmPassword}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium
                   text-white bg-blue-600 hover:bg-blue-700
                   disabled:bg-slate-300 disabled:cursor-not-allowed
                   rounded-lg transition-colors"
      >
        {isSubmitting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Updating...
          </>
        ) : (
          'Update Password'
        )}
      </button>
    </form>
  );
}

/**
 * PasswordStrengthIndicator - Visual indicator for password strength
 */
function PasswordStrengthIndicator({ password }: { password: string }) {
  const getStrength = (): { level: number; label: string; color: string } => {
    let score = 0;
    
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    
    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-amber-500' };
    if (score <= 3) return { level: 3, label: 'Good', color: 'bg-blue-500' };
    return { level: 4, label: 'Strong', color: 'bg-green-500' };
  };

  const { level, label, color } = getStrength();

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-6 h-1.5 rounded-full ${i <= level ? color : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className={level <= 1 ? 'text-red-600' : level <= 2 ? 'text-amber-600' : level <= 3 ? 'text-blue-600' : 'text-green-600'}>
        {label}
      </span>
    </div>
  );
}

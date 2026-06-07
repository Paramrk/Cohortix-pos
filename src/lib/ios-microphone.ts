/**
 * iOS-compatible microphone access utility
 * Handles permission requests and browser compatibility
 */

export interface MicrophonePermission {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
  message?: string;
}

/**
 * Check and request microphone access on iOS and other browsers
 * Must be called from a user gesture (click, tap)
 */
export async function requestMicrophoneAccess(): Promise<MicrophonePermission> {
  try {
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        granted: false,
        denied: true,
        prompt: false,
        message: 'Microphone access is not supported on this device or browser.',
      };
    }

    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Stop the stream immediately (we just needed permission)
    stream.getTracks().forEach(track => track.stop());
    
    return {
      granted: true,
      denied: false,
      prompt: false,
    };
  } catch (error) {
    const errorMessage = error instanceof DOMException ? error.message : String(error);
    
    // Handle specific permission errors
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        return {
          granted: false,
          denied: true,
          prompt: false,
          message: 'Microphone access was denied. Please enable it in settings.',
        };
      }
      if (error.name === 'NotFoundError' || error.name === 'DeviceNotFoundError') {
        return {
          granted: false,
          denied: true,
          prompt: false,
          message: 'No microphone device found on this device.',
        };
      }
      if (error.name === 'SecurityError') {
        return {
          granted: false,
          denied: true,
          prompt: false,
          message: 'Microphone access is not available in this context. Make sure you are using HTTPS.',
        };
      }
    }
    
    return {
      granted: false,
      denied: false,
      prompt: true,
      message: errorMessage,
    };
  }
}

/**
 * Check current microphone permission status
 */
export async function checkMicrophonePermission(): Promise<MicrophonePermission> {
  try {
    if (!navigator.permissions?.query) {
      return {
        granted: false,
        denied: false,
        prompt: true,
        message: 'Permission API not available',
      };
    }

    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    
    return {
      granted: result.state === 'granted',
      denied: result.state === 'denied',
      prompt: result.state === 'prompt',
    };
  } catch (error) {
    // Fallback if permissions API fails
    return {
      granted: false,
      denied: false,
      prompt: true,
    };
  }
}

/**
 * Get a microphone stream for recording
 * Requires prior permission from requestMicrophoneAccess
 */
export async function getMicrophoneStream(): Promise<MediaStream | null> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('[iOS Microphone] getUserMedia not available');
      return null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } 
    });
    
    return stream;
  } catch (error) {
    console.error('[iOS Microphone] Error getting microphone stream:', error);
    return null;
  }
}

/**
 * iOS-specific check: returns true if running as a web app on iOS
 */
export function isIOSWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isStandalone = 
    'standalone' in window.navigator && 
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  return isIOS && (isStandalone || isDisplayStandalone);
}

/**
 * iOS-specific check: returns true if in Safari browser
 */
export function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|puffin|opera/.test(ua);
  
  return isIOS && isSafari;
}

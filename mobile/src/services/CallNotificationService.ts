/**
 * Call Notification Service — Jan Sunwai React Native
 *
 * Handles incoming call notifications to provide WhatsApp-style
 * "sudden ringing" on locked devices.
 *
 * Architecture:
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │ ANDROID                                                  │
 * │ ──────                                                   │
 * │ 1. Server sends HIGH PRIORITY FCM data-only message      │
 * │ 2. App's headless JS task receives it (even if killed)   │
 * │ 3. Uses Android ConnectionService / TelecomManager or    │
 * │    NotificationCompat.setFullScreenIntent() to display   │
 * │    native full-screen incoming call UI on lock screen     │
 * │ 4. Plays ringtone via STREAM_RING channel                │
 * │ 5. User swipes Accept → opens LiveKit video room         │
 * │                                                          │
 * │ iOS                                                      │
 * │ ──                                                       │
 * │ 1. Server sends VoIP Push via Apple PushKit              │
 * │ 2. react-native-callkeep / CallKit integration receives  │
 * │    the push and displays native iOS incoming call UI      │
 * │ 3. Shows caller name on lock screen + plays ringtone     │
 * │ 4. User slides to answer → opens LiveKit video room      │
 * └──────────────────────────────────────────────────────────┘
 *
 * Dependencies:
 * - @notifee/react-native (Android full-screen notifications)
 * - react-native-callkeep (iOS CallKit / Android ConnectionService)
 * - @react-native-firebase/messaging (FCM high-priority push)
 *
 * Note: This file provides the architecture and integration patterns.
 * In a production build, these native modules must be properly linked
 * and configured per each platform's requirements.
 */

import { Platform, AppState } from 'react-native';

// ─── Types ────────────────────────────────────────────────────

export interface IncomingCallPayload {
  callId: string;
  grievanceId: string;
  callerName: string;
  callerDesignation: string;
  title: string;
  roomName: string;
  participantCount: string;
  yourRole: string;
}

// ─── Android: Full-Screen Notification via @notifee ──────────

/**
 * Display a full-screen incoming call notification on Android.
 *
 * Uses @notifee/react-native to create a high-importance notification
 * with fullScreenAction — this wakes the device and shows a full-screen
 * incoming call UI even when the phone is locked.
 *
 * Android Requirements:
 * - Uses a dedicated notification channel with IMPORTANCE_HIGH
 * - Sets category to 'call' for proper system handling
 * - Uses fullScreenAction to launch the call UI on locked devices
 * - Plays sound from STREAM_RING for audible ringtone
 *
 * @see https://notifee.app/react-native/docs/android/interaction#full-screen
 */
export async function showAndroidIncomingCallNotification(
  payload: IncomingCallPayload
): Promise<void> {
  // Dynamic import to avoid errors when notifee isn't installed
  try {
    const notifee = require('@notifee/react-native').default;

    // Create or get the call notification channel
    const channelId = await notifee.createChannel({
      id: 'jan-sunwai-calls',
      name: 'Jan Sunwai Incoming Calls',
      importance: 4, // IMPORTANCE_HIGH — makes heads-up notification
      sound: 'ringtone', // Custom ringtone in /res/raw/ringtone.mp3
      vibration: true,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lights: true,
      lightColor: '#f59e0b', // Saffron
    });

    // Display the full-screen call notification
    await notifee.displayNotification({
      id: `call-${payload.callId}`,
      title: '🏛️ Jan Sunwai Hearing',
      body: `${payload.callerName}\n${payload.callerDesignation}\n${payload.title}`,
      data: payload as unknown as Record<string, string>,
      android: {
        channelId,
        category: 'call' as any,
        ongoing: true, // Cannot be swiped away
        autoCancel: false,
        importance: 4,
        pressAction: {
          id: 'accept-call',
          launchActivity: 'default',
        },
        // Full-screen intent: shows call UI on lock screen
        fullScreenAction: {
          id: 'accept-call',
          launchActivity: 'default',
        },
        actions: [
          {
            title: '✅ Accept',
            pressAction: { id: 'accept-call' },
          },
          {
            title: '❌ Decline',
            pressAction: { id: 'decline-call' },
          },
        ],
        // Show even on lock screen
        visibility: 1, // VISIBILITY_PUBLIC
        // Use call-style notification (Android 12+)
        style: {
          type: 1, // BigTextStyle
          text: `${payload.callerName} • ${payload.callerDesignation}\n\nTopic: ${payload.title}\nParticipants: ${payload.participantCount}`,
        },
      },
    });

    console.log('[CallNotification] Android full-screen notification displayed');
  } catch (err) {
    console.error('[CallNotification] Failed to show Android notification:', err);
  }
}

// ─── iOS: CallKit Integration via react-native-callkeep ──────

/**
 * Display a native iOS incoming call screen using CallKit.
 *
 * Uses react-native-callkeep to interface with Apple's CallKit framework,
 * which provides:
 * - Native lock-screen incoming call UI (identical to regular phone calls)
 * - System-level call answering with swipe gesture
 * - Audio routing management
 * - Call history integration
 *
 * iOS Requirements:
 * - PushKit VoIP Push Notifications must be configured
 * - Background Mode: Voice over IP must be enabled in Xcode
 * - CallKit capability must be added
 *
 * @see https://github.com/react-native-webrtc/react-native-callkeep
 */
export function setupIOSCallKit(): void {
  try {
    const RNCallKeep = require('react-native-callkeep').default;

    // Configure CallKit
    RNCallKeep.setup({
      ios: {
        appName: 'Jan Sunwai',
        supportsVideo: true,
        maximumCallGroups: 1,
        maximumCallsPerCallGroup: 1,
        iconTemplateImageName: 'CallKitIcon', // 40x40pt icon in Assets.xcassets
        ringtoneSound: 'ringtone.caf', // Custom ringtone in bundle
      },
      android: {
        alertTitle: 'Jan Sunwai — Permissions Required',
        alertDescription:
          'This app needs phone account permissions to receive incoming hearing calls',
        cancelButton: 'Cancel',
        okButton: 'OK',
        additionalPermissions: [],
        selfManaged: true, // We manage our own call UI
      },
    });

    // Handle CallKit events
    RNCallKeep.addEventListener('answerCall', ({ callUUID }: { callUUID: string }) => {
      console.log('[CallKit] Call answered:', callUUID);
      // Navigate to the video call screen
      // This is handled by the app's navigation system
    });

    RNCallKeep.addEventListener('endCall', ({ callUUID }: { callUUID: string }) => {
      console.log('[CallKit] Call ended:', callUUID);
      // Notify backend of call decline/end
    });

    console.log('[CallKit] iOS CallKit configured successfully');
  } catch (err) {
    console.error('[CallKit] Failed to setup CallKit:', err);
  }
}

/**
 * Display an incoming call on iOS using CallKit's native UI.
 * This triggers the full-screen iOS incoming call screen with ringtone.
 */
export function showIOSIncomingCall(payload: IncomingCallPayload): void {
  try {
    const RNCallKeep = require('react-native-callkeep').default;

    // Display the native iOS incoming call screen
    RNCallKeep.displayIncomingCall(
      payload.callId, // callUUID
      payload.callerName, // handle (phone number or name)
      `${payload.callerName}`, // localizedCallerName
      'generic', // handleType: 'generic', 'number', or 'email'
      true, // hasVideo
      {
        // Additional options
        callType: 'video',
      }
    );

    console.log('[CallKit] Incoming call displayed:', payload.callerName);
  } catch (err) {
    console.error('[CallKit] Failed to display incoming call:', err);
  }
}

// ─── FCM Message Handler (Headless Background Task) ──────────

/**
 * Handle incoming FCM data messages for call notifications.
 *
 * This function is registered as a background message handler
 * that runs even when the app is killed. It's the entry point
 * for all incoming Jan Sunwai call signals on mobile.
 *
 * FCM payload structure (sent by our backend):
 * {
 *   data: {
 *     type: "incoming_call",
 *     callId: "uuid",
 *     grievanceId: "RAJ-2024-88421",
 *     callerName: "Sh. Alok Sharma, IAS",
 *     callerDesignation: "District Collector & DM, Jaipur",
 *     title: "Jan Sunwai — Water Pipeline Leak",
 *     roomName: "JS-RAJ-2024-88421",
 *     participantCount: "3",
 *     yourRole: "citizen"
 *   },
 *   // IMPORTANT: No `notification` key — data-only ensures
 *   // the headless handler runs on both platforms
 * }
 */
export async function handleFCMBackgroundMessage(
  remoteMessage: { data?: Record<string, string> }
): Promise<void> {
  const data = remoteMessage.data;

  if (!data || data.type !== 'incoming_call') {
    return;
  }

  console.log('[FCM] Incoming call push received:', data.callerName);

  const payload: IncomingCallPayload = {
    callId: data.callId || '',
    grievanceId: data.grievanceId || '',
    callerName: data.callerName || 'Jan Sunwai',
    callerDesignation: data.callerDesignation || '',
    title: data.title || 'Jan Sunwai Hearing',
    roomName: data.roomName || '',
    participantCount: data.participantCount || '3',
    yourRole: data.yourRole || 'citizen',
  };

  if (Platform.OS === 'android') {
    await showAndroidIncomingCallNotification(payload);
  } else if (Platform.OS === 'ios') {
    showIOSIncomingCall(payload);
  }
}

// ─── Notification Action Handler ─────────────────────────────

/**
 * Handle user actions on the incoming call notification:
 * - 'accept-call': Navigate to video call screen with LiveKit
 * - 'decline-call': Send decline response to backend
 *
 * This is registered in the app's entry point to handle both
 * foreground and background notification interactions.
 */
export function setupNotificationActionHandler(
  onAcceptCall: (payload: IncomingCallPayload) => void,
  onDeclineCall: (payload: IncomingCallPayload) => void
): void {
  if (Platform.OS === 'android') {
    try {
      const notifee = require('@notifee/react-native').default;

      notifee.onBackgroundEvent(
        async ({ type, detail }: { type: number; detail: any }) => {
          const { notification, pressAction } = detail;
          const data = notification?.data as IncomingCallPayload;

          if (!data) return;

          // EventType.ACTION_PRESS = 1
          if (type === 1) {
            if (pressAction?.id === 'accept-call') {
              onAcceptCall(data);
            } else if (pressAction?.id === 'decline-call') {
              onDeclineCall(data);
            }

            // Dismiss the notification
            await notifee.cancelNotification(`call-${data.callId}`);
          }
        }
      );

      console.log('[CallNotification] Android action handler configured');
    } catch (err) {
      console.error('[CallNotification] Failed to setup action handler:', err);
    }
  }
}

// ─── Export ───────────────────────────────────────────────────

export const callNotificationService = {
  showAndroidIncomingCallNotification,
  setupIOSCallKit,
  showIOSIncomingCall,
  handleFCMBackgroundMessage,
  setupNotificationActionHandler,
};

export default callNotificationService;

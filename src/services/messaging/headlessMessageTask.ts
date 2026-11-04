import { IncomingMessage } from './messageService';
import { handleIncomingMessage } from './incomingMessageHandler';

export interface HeadlessTaskData {
  body: string;
  sender: string;
  source: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationTimestamp?: number;
}

/**
 * Headless JS task handler executed by React Native when an SMS or notification
 * arrives while SpendWise is terminated or minimized in the background.
 */
export async function messageHeadlessTask(taskData: HeadlessTaskData): Promise<void> {
  if (!taskData || !taskData.body) return;

  const message: IncomingMessage = {
    body: taskData.body,
    sender: taskData.sender,
    source: (taskData.source as any) || 'sms',
    timestamp: Date.now(),
  };

  if (taskData.latitude !== undefined && taskData.longitude !== undefined) {
    message.location = {
      latitude: taskData.latitude,
      longitude: taskData.longitude,
      accuracy: taskData.accuracy,
      timestamp: taskData.locationTimestamp,
    };
  }

  try {
    const result = await handleIncomingMessage(message);
    console.log(`[HeadlessTask] Processed background message from ${message.sender}:`, result.kind);
  } catch (err) {
    console.error(`[HeadlessTask] Failed to process background message from ${message.sender}:`, err);
  }
}


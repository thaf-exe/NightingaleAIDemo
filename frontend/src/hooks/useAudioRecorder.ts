/**
 * Audio Recording Hook
 * 
 * Records audio from the microphone and returns a Blob.
 * Used for voice chat with real API-based speech recognition.
 */

import { useState, useRef, useCallback } from 'react';

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  clearRecording: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioBlob(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      
      streamRef.current = stream;

      // Use webm for better compatibility, fallback to other formats
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access to use voice chat.');
      } else {
        setError('Failed to start recording. Please check your microphone.');
      }
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { 
          type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
        });
        setAudioBlob(blob);
        setIsRecording(false);
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    chunksRef.current = [];
    setIsRecording(false);
    setAudioBlob(null);
  }, []);

  const clearRecording = useCallback(() => {
    setAudioBlob(null);
    chunksRef.current = [];
  }, []);

  return {
    isRecording,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearRecording,
  };
}

export default useAudioRecorder;

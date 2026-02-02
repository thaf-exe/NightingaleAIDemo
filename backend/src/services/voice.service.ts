/**
 * Voice Service
 * 
 * Handles speech-to-text and text-to-speech:
 * - Groq Whisper for transcription (uses existing API key)
 * - Google TTS for speech synthesis (free, no API key)
 */

import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Transcribe audio to text using Groq Whisper
 * 
 * Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm
 * Max file size: 25 MB
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  try {
    const fileStream = fs.createReadStream(filePath);
    
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-large-v3',
      language: 'en',
      response_format: 'json',
    });

    // With json format, response has a text property
    return (transcription.text || '').trim();
  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }
}

/**
 * Synthesize speech from text using Google TTS
 * 
 * This uses the free Google Translate TTS service
 * Returns an MP3 audio buffer
 */
export async function synthesizeSpeech(text: string, language: string = 'en'): Promise<Buffer> {
  // Import gtts (CommonJS module)
  const gTTS = require('gtts');
  
  return new Promise((resolve, reject) => {
    try {
      const gtts = new gTTS(text, language);
      const chunks: Buffer[] = [];
      
      const stream = gtts.stream();
      
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', (err: Error) => {
        console.error('TTS stream error:', err);
        reject(new Error('Failed to synthesize speech'));
      });
    } catch (error) {
      console.error('TTS error:', error);
      reject(new Error('Failed to synthesize speech'));
    }
  });
}

/**
 * Clean up temporary audio files older than 1 hour
 */
export function cleanupOldFiles(uploadDir: string): void {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  try {
    if (!fs.existsSync(uploadDir)) return;
    
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < oneHourAgo) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

declare module 'gtts' {
  import { Readable } from 'stream';

  interface gTTSOptions {
    lang?: string;
    slow?: boolean;
    host?: string;
  }

  class gTTS {
    constructor(text: string, lang?: string, slow?: boolean);
    stream(): Readable;
    save(filename: string, callback: (err: Error | null) => void): void;
  }

  export = gTTS;
}

/**
 * Web-APIs, die YouTube.js erwartet und die Hermes/React Native nicht
 * (vollständig) mitbringen. Muss vor allem anderen importiert werden.
 */
import 'react-native-url-polyfill/auto';
import * as ExpoCrypto from 'expo-crypto';

const g = globalThis as Record<string, any>;

// crypto.getRandomValues / randomUUID
g.crypto ??= {};
g.crypto.getRandomValues ??= ExpoCrypto.getRandomValues;
g.crypto.randomUUID ??= ExpoCrypto.randomUUID;

// CustomEvent (wird von YouTube.js nur als Datencontainer genutzt)
if (typeof g.CustomEvent !== 'function') {
  g.CustomEvent = class CustomEvent<T = unknown> {
    readonly type: string;
    readonly detail: T;
    constructor(type: string, init?: { detail?: T }) {
      this.type = type;
      this.detail = init?.detail as T;
    }
  };
}

// TextDecoder (nur UTF-8), falls die Hermes-Version keinen mitbringt
if (typeof g.TextDecoder !== 'function') {
  g.TextDecoder = class TextDecoder {
    readonly encoding = 'utf-8';
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return '';
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '';
      for (let i = 0; i < bytes.length;) {
        const b = bytes[i++];
        let cp: number;
        if (b < 0x80) cp = b;
        else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
        else if (b < 0xf0)
          cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        else
          cp =
            ((b & 0x07) << 18) |
            ((bytes[i++] & 0x3f) << 12) |
            ((bytes[i++] & 0x3f) << 6) |
            (bytes[i++] & 0x3f);
        out += String.fromCodePoint(cp);
      }
      return out;
    }
  };
}

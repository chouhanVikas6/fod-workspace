import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

let ioInstance: SocketeerClient | null = null;

interface EventHandler {
  (payload: any): void;
}

interface SocketeerClientOptions {
  timeout?: number;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  transports?: string[];
}

/**
 * Tauri IPC replacement for the legacy Socket.IO `/gui` client.
 * Subscribes to `gui:<eventName>` Tauri events and sends outgoing events via
 * `invoke('socket_emit', ...)`.
 */
class SocketeerClient {
  private static instance: SocketeerClient | null = null;
  private url: string;
  private options: SocketeerClientOptions;
  private eventHandlers: { [eventName: string]: EventHandler };
  private unlistenFns: { [eventName: string]: UnlistenFn };
  private healthInterval: ReturnType<typeof setInterval> | null;

  private constructor(
    url: string,
    eventHandler: { [eventName: string]: EventHandler } = {},
    options: SocketeerClientOptions = {}
  ) {
    this.url = url;
    this.options = options;
    this.eventHandlers = { ...eventHandler };
    this.unlistenFns = {};
    this.healthInterval = null;
    this.connect();
  }

  public static getInstance(
    url: string,
    eventHandler: { [eventName: string]: EventHandler } = {},
    options: SocketeerClientOptions = {}
  ): SocketeerClient {
    if (!SocketeerClient.instance) {
      SocketeerClient.instance = new SocketeerClient(url, eventHandler, options);
    }
    return SocketeerClient.instance;
  }

  private connect(): void {
    Object.keys(this.eventHandlers).forEach((eventName) => {
      const handler = this.eventHandlers[eventName];
      if (typeof handler === 'function') {
        this.bindTauriListener(eventName, handler);
      }
    });

    this.healthInterval = setInterval(() => {
      this.emitEvent('guiHeartBeat', {});
    }, 1000);
  }

  private bindTauriListener(eventName: string, eventHandler: EventHandler): void {
    if (this.unlistenFns[eventName]) {
      this.unlistenFns[eventName]();
      delete this.unlistenFns[eventName];
    }

    const tauriEvent = eventName.startsWith('gui:') ? eventName : `gui:${eventName}`;
    listen(tauriEvent, (event) => {
      const fn = this.eventHandlers[eventName];
      if (typeof fn === 'function') {
        fn(event.payload);
      }
    })
      .then((unlisten) => {
        if (this.eventHandlers[eventName] === eventHandler) {
          this.unlistenFns[eventName] = unlisten;
        } else {
          unlisten();
        }
      })
      .catch((err) => {
        console.error(`Failed to listen on Tauri event ${tauriEvent}:`, err);
      });
  }

  public addEventHandler(eventName: string, eventHandler: EventHandler): void {
    this.eventHandlers[eventName] = eventHandler;
    this.bindTauriListener(eventName, eventHandler);
  }

  public removeEventHandler(eventName: string): void {
    delete this.eventHandlers[eventName];
    if (this.unlistenFns[eventName]) {
      this.unlistenFns[eventName]();
      delete this.unlistenFns[eventName];
    }
  }

  public emitEvent(eventName: string, eventData: any): void {
    invoke('socket_emit', {
      namespace: '/gui',
      event: eventName,
      payload: eventData ?? null,
    }).catch((err) => {
      console.debug('socket_emit error:', err);
    });
  }
}

const getSocketServer = (
  url: string,
  eventHandler: { [eventName: string]: EventHandler } = {},
  options: SocketeerClientOptions = {}
): SocketeerClient => {
  if (!ioInstance) {
    ioInstance = SocketeerClient.getInstance(url, eventHandler, options);
  }
  return ioInstance;
};

export default getSocketServer;

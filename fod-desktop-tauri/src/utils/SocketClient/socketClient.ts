import { io, Socket } from 'socket.io-client';
import { config } from '@/config/clientConfig';

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

class SocketeerClient {
  private static instance: SocketeerClient | null = null;
  private url: string;
  private options: SocketeerClientOptions;
  private socket: any;
  private eventHandlers: { [eventName: string]: EventHandler };
  private healthInterval: NodeJS.Timeout | null;

  private constructor(
    url: string,
    eventHandler: { [eventName: string]: EventHandler } = {},
    options: SocketeerClientOptions = {
      timeout: 5000,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket'],
    }
  ) {
    this.url = url;
      this.options = options;
      this.socket = null;
      this.eventHandlers = eventHandler;
      this.healthInterval = null;
    // The sidecar's socket.io server is always up by the time the renderer
    // loads (no lazy bootstrap needed — see Phase 2 step 4 of
    // docs/electron-to-tauri-migration-plan.md), so connect straight away
    // instead of probing '/api/socket' first.
    this.connect();
    this.setupCleanup();
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
    this.socket = io(this.url, this.options);

    this.socket.on('connect', () => {
      console.log('i am connected to gui server:', this.url);
      this.handleConnect();
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('Connection error On gui Socket:', error);
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('Disconnected from gui server:', reason);
      this.handleDisconnect(reason);
    });
  }

  private handleConnect(): void {
    // Register event handlers upon successful connection
    Object.keys(this.eventHandlers).forEach((eventName) => {
      const eventHandler = this.eventHandlers[eventName];
      if (typeof eventHandler === 'function') {
        this.socket!.on(eventName, eventHandler);
      } else {
        console.error(`Invalid event handler for event: ${eventName}`);
      }
    });

    this.healthInterval = setInterval(() => {
      this.emitEvent('guiHeartBeat', {});
    }, 1000); // Emit every second
  }

  private handleDisconnect(reason: string): void {
    // Handle disconnections
    console.warn('Disconnected:', reason);
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  public addEventHandler(eventName: string, eventHandler: EventHandler): void {
    // Add event handler dynamically
    this.eventHandlers[eventName] = eventHandler;
    if (this.socket) {
      this.socket.on(eventName, eventHandler);
    }
  }

  public removeEventHandler(eventName: string): void {
    // Remove event handler dynamically
    delete this.eventHandlers[eventName];
    if (this.socket) {
      this.socket.off(eventName);
    }
  }

  public emitEvent(eventName: string, eventData: any): void {
    // Emit event to server
    if (this.socket && this.socket.connected) {
      this.socket.emit(eventName, eventData);
    } else {
      console.error('Socket not connected. Cannot emit event:', eventName);
    }
  }

  private setupCleanup(): void {
    const cleanup = () => {
      if (this.socket) {
        this.socket.close();
        console.log('Socket connection closed');
      }
      if (this.healthInterval) {
        clearInterval(this.healthInterval);
      }
      SocketeerClient.instance = null;
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
}

const getSocketServer = (
  url:string,
  eventHandler: { [eventName: string]: EventHandler } = {},
  options: SocketeerClientOptions
): SocketeerClient => {
  if (!ioInstance) {

    console.log("will rn on 1st time")
    ioInstance = SocketeerClient.getInstance(url);
  }

  console.log("value of", ioInstance)
  return ioInstance;
};



export default getSocketServer;

class SocketDataStore {
    private static instance: SocketDataStore;
    private data: { [userId: string]: any[] } = {};
  
    private constructor() {}
  
    public static getInstance(): SocketDataStore {
      if (!SocketDataStore.instance) {
        SocketDataStore.instance = new SocketDataStore();
      }
      return SocketDataStore.instance;
    }
  
    public addData(userId: string, item: any): void {
      if (!this.data[userId]) {
        this.data[userId] = [];
      }
      this.data[userId].push(item);
    }
  
    public getData(userId: string): any[] {
      return this.data[userId] || [];
    }
  
    public clearData(userId: string): void {
      delete this.data[userId];
    }
  }
  
  export default SocketDataStore;
  
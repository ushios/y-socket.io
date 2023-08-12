// src/client/provider.ts
import * as s from "yjs";
import * as a from "lib0/broadcastchannel";
import * as n from "y-protocols/awareness";
import { Observable as b } from "lib0/observable";
import { io as w } from "socket.io-client";
var d = class extends b {
  /**
   * SocketIOProvider constructor
   * @constructor
   * @param {string} url The connection url from server
   * @param {string} roomName The document's room name
   * @param {Y.Doc} doc The yjs document
   * @param {ProviderConfiguration} options Configuration options to the SocketIOProvider
   */
  constructor(e, t, o = new s.Doc(), {
    autoConnect: c = !0,
    awareness: i = new n.Awareness(o),
    resyncInterval: h = -1,
    disableBc: l = !1,
    auth: p = {},
    managerOptions: y = {}
  }) {
    super();
    /**
     * The broadcast channel connection status indicator
     * @type {boolean}
     */
    this.bcconnected = !1;
    /**
     * The document's sync status indicator
     * @type {boolean}
     * @private
     */
    this._synced = !1;
    /**
     * Interval to emit `sync-step-1` to sync changes
     * @type {NodeJS.Timer | null}
     * @private
     */
    this.resyncInterval = null;
    /**
     * This function initializes the socket event listeners to synchronize document changes.
     *
     *  The synchronization protocol is as follows:
     *  - A server emits the sync step one event (`sync-step-1`) which sends the document as a state vector
     *    and the sync step two callback as an acknowledgment according to the socket io acknowledgments.
     *  - When the client receives the `sync-step-1` event, it executes the `syncStep2` acknowledgment callback and sends
     *    the difference between the received state vector and the local document (this difference is called an update).
     *  - The second step of the sync is to apply the update sent in the `syncStep2` callback parameters from the client
     *    to the document on the server side.
     *  - There is another event (`sync-update`) that is emitted from the server, which sends an update for the document,
     *    and when the client receives this event, it applies the received update to the local document.
     *  - When an update is applied to a document, it will fire the document's "update" event, which
     *    sends the update to the server.
     * @type {() => void}
     * @private
     */
    this.initSyncListeners = () => {
      this.socket.on(
        "sync-step-1",
        (e, t) => {
          t(s.encodeStateAsUpdate(this.doc, new Uint8Array(e))), this.synced = !0;
        }
      ), this.socket.on("sync-update", this.onSocketSyncUpdate);
    };
    /**
     * This function initializes socket event listeners to synchronize awareness changes.
     *
     *  The awareness protocol is as follows:
     *  - The server emits the `awareness-update` event by sending the awareness update.
     *  - The client receives that event and applies the received update to the local awareness.
     *  - When an update is applied to awareness, the awareness "update" event will fire, which
     *    sends the update to the server.
     * @type {() => void}
     * @private
     */
    this.initAwarenessListeners = () => {
      this.socket.on("awareness-update", (e) => {
        n.applyAwarenessUpdate(
          this.awareness,
          new Uint8Array(e),
          this
        );
      });
    };
    /**
     * This function initialize the window or process events listener. Specifically set ups the
     * window `beforeunload` and process `exit` events to remove the client from the awareness.
     * @type {() => void}
     */
    this.initSystemListeners = () => {
      typeof window != "undefined" ? window.addEventListener("beforeunload", this.beforeUnloadHandler) : typeof process != "undefined" && process.on("exit", this.beforeUnloadHandler);
    };
    /**
     * This function runs when the socket connects and reconnects and emits the `sync-step-1`
     * and `awareness-update` socket events to start synchronization.
     *
     *  Also starts the resync interval if is enabled.
     * @private
     * @param {() => void | Promise<void>} onConnect (Optional) A callback that will be triggered every time that socket is connected or reconnected
     * @param {number} resyncInterval (Optional) A number of milliseconds for interval of synchronize
     * @type {(onConnect: () => void | Promise<void>, resyncInterval: number = -1) => void}
     */
    this.onSocketConnection = (e = -1) => {
      this.emit("status", [{ status: "connected" }]), this.socket.emit(
        "sync-step-1",
        s.encodeStateVector(this.doc),
        (t) => {
          s.applyUpdate(this.doc, new Uint8Array(t), this);
        }
      ), this.awareness.getLocalState() !== null && this.socket.emit(
        "awareness-update",
        n.encodeAwarenessUpdate(this.awareness, [
          this.doc.clientID
        ])
      ), e > 0 && (this.resyncInterval = setInterval(() => {
        this.socket.disconnected || this.socket.emit(
          "sync-step-1",
          s.encodeStateVector(this.doc),
          (t) => {
            s.applyUpdate(this.doc, new Uint8Array(t), this);
          }
        );
      }, e));
    };
    /**
     * This function runs when the socket is disconnected and emits the socket event `awareness-update`
     * which removes this client from awareness.
     * @private
     * @param {Socket.DisconnectReason} event The reason of the socket disconnection
     * @param {() => void | Promise<void>} onDisconnect (Optional) A callback that will be triggered every time that socket is disconnected
     * @type {(event: Socket.DisconnectReason, onDisconnect: () => void | Promise<void>) => void}
     */
    this.onSocketDisconnection = (e) => {
      this.emit("connection-close", [e, this]), this.synced = !1, n.removeAwarenessStates(
        this.awareness,
        Array.from(this.awareness.getStates().keys()).filter(
          (t) => t !== this.doc.clientID
        ),
        this
      ), this.emit("status", [{ status: "disconnected" }]);
    };
    /**
     * This function is executed when the socket connection fails.
     * @param {Error} error The error in the connection
     * @param {(error: Error) => void | Promise<void>} onConnectError (Optional) A callback that will be triggered every time that socket has a connection error
     * @type {(error: Error, onConnectError: (error: Error) => void | Promise<void>) => void}
     */
    this.onSocketConnectionError = (e) => {
      this.emit("connection-error", [e, this]);
    };
    /**
     * This function is executed when the document is updated, if the instance that
     * emit the change is not this, it emit the changes by socket and broadcast channel.
     * @private
     * @param {Uint8Array} update Document update
     * @param {SocketIOProvider} origin The SocketIOProvider instance that emits the change.
     * @type {(update: Uint8Array, origin: SocketIOProvider) => void}
     */
    this.onUpdateDoc = (e, t) => {
      t !== this && (this.socket.emit("sync-update", e), this.bcconnected && a.publish(
        this._broadcastChannel,
        {
          type: "sync-update",
          data: e
        },
        this
      ));
    };
    /**
     * This function is called when the server emits the `sync-update` event and applies the received update to the local document.
     * @private
     * @param {Uint8Array}update A document update received by the `sync-update` socket event
     * @type {(update: Uint8Array) => void}
     */
    this.onSocketSyncUpdate = (e) => {
      s.applyUpdate(this.doc, new Uint8Array(e), this);
    };
    /**
     * This function is executed when the local awareness changes and this broadcasts the changes per socket and broadcast channel.
     * @private
     * @param {{ added: number[], updated: number[], removed: number[] }} awarenessChanges The clients added, updated and removed
     * @param {SocketIOProvider | null} origin The SocketIOProvider instance that emits the change.
     * @type {({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: SocketIOProvider | null) => void}
     */
    this.awarenessUpdate = ({ added: e, updated: t, removed: o }, c) => {
      let i = e.concat(t).concat(o);
      this.socket.emit(
        "awareness-update",
        n.encodeAwarenessUpdate(this.awareness, i)
      ), this.bcconnected && a.publish(
        this._broadcastChannel,
        {
          type: "awareness-update",
          data: n.encodeAwarenessUpdate(
            this.awareness,
            i
          )
        },
        this
      );
    };
    /**
     * This function is executed when the windows will be unloaded or the process will be closed and this
     * will remove the local client from awareness.
     * @private
     * @type {() => void}
     */
    this.beforeUnloadHandler = () => {
      n.removeAwarenessStates(
        this.awareness,
        [this.doc.clientID],
        "window unload"
      );
    };
    /**
     * This function subscribes the provider to the broadcast channel and initiates synchronization by broadcast channel.
     * @type {() => void}
     */
    this.connectBc = () => {
      this.bcconnected || (a.subscribe(this._broadcastChannel, this.onBroadcastChannelMessage), this.bcconnected = !0), a.publish(
        this._broadcastChannel,
        { type: "sync-step-1", data: s.encodeStateVector(this.doc) },
        this
      ), a.publish(
        this._broadcastChannel,
        { type: "sync-step-2", data: s.encodeStateAsUpdate(this.doc) },
        this
      ), a.publish(
        this._broadcastChannel,
        { type: "query-awareness", data: null },
        this
      ), a.publish(
        this._broadcastChannel,
        {
          type: "awareness-update",
          data: n.encodeAwarenessUpdate(this.awareness, [
            this.doc.clientID
          ])
        },
        this
      );
    };
    /**
     * This function unsubscribes the provider from the broadcast channel and before unsubscribing, updates the awareness.
     * @type {() => void}
     */
    this.disconnectBc = () => {
      a.publish(
        this._broadcastChannel,
        {
          type: "awareness-update",
          data: n.encodeAwarenessUpdate(
            this.awareness,
            [this.doc.clientID],
            /* @__PURE__ */ new Map()
          )
        },
        this
      ), this.bcconnected && (a.unsubscribe(this._broadcastChannel, this.onBroadcastChannelMessage), this.bcconnected = !1);
    };
    /**
     * This method handles messages received by the broadcast channel and responds to them.
     * @param {{ type: string, data: any }} message The object message received by broadcast channel
     * @param {SocketIOProvider} origin The SocketIOProvider instance that emits the change
     * @type {(message: { type: string, data: any }, origin: SocketIOProvider) => void}
     */
    this.onBroadcastChannelMessage = (e, t) => {
      if (t !== this && e.type.length > 0)
        switch (e.type) {
          case "sync-step-1":
            a.publish(
              this._broadcastChannel,
              {
                type: "sync-step-2",
                data: s.encodeStateAsUpdate(this.doc, e.data)
              },
              this
            );
            break;
          case "sync-step-2":
            s.applyUpdate(this.doc, new Uint8Array(e.data), this);
            break;
          case "sync-update":
            s.applyUpdate(this.doc, new Uint8Array(e.data), this);
            break;
          case "query-awareness":
            a.publish(
              this._broadcastChannel,
              {
                type: "awareness-update",
                data: n.encodeAwarenessUpdate(
                  this.awareness,
                  Array.from(this.awareness.getStates().keys())
                )
              },
              this
            );
            break;
          case "awareness-update":
            n.applyAwarenessUpdate(
              this.awareness,
              new Uint8Array(e.data),
              this
            );
            break;
          default:
            break;
        }
    };
    for (; e[e.length - 1] === "/"; )
      e = e.slice(0, e.length - 1);
    this._url = e, this.roomName = t, this.doc = o, this.awareness = i, this._broadcastChannel = `${e}/${t}`, this.disableBc = l, this.socket = w(`${this.url}/yjs|${t}`, {
      autoConnect: !1,
      transports: ["websocket"],
      forceNew: !0,
      auth: p,
      ...y
    }), this.doc.on("update", this.onUpdateDoc), this.socket.on("connect", () => this.onSocketConnection(h)), this.socket.on("disconnect", (r) => this.onSocketDisconnection(r)), this.socket.on(
      "connect_error",
      (r) => this.onSocketConnectionError(r)
    ), this.initSyncListeners(), this.initAwarenessListeners(), this.initSystemListeners(), i.on("update", this.awarenessUpdate), c && this.connect();
  }
  /**
   * Broadcast channel room getter
   * @type {string}
   */
  get broadcastChannel() {
    return this._broadcastChannel;
  }
  /**
   * URL getter
   * @type {string}
   */
  get url() {
    return this._url;
  }
  /**
   * Synchronized state flag getter
   * @type {boolean}
   */
  get synced() {
    return this._synced;
  }
  /**
   * Synchronized state flag setter
   */
  set synced(e) {
    this._synced !== e && (this._synced = e, this.emit("synced", [e]), this.emit("sync", [e]));
  }
  /**
   * Connect provider's socket
   * @type {() => void}
   */
  connect() {
    this.socket.connected || (this.emit("status", [{ status: "connecting" }]), this.socket.connect(), this.disableBc || this.connectBc(), this.synced = !1);
  }
  /**
   * Disconnect provider's socket
   * @type {() => void}
   */
  disconnect() {
    this.socket.connected && (this.disconnectBc(), this.socket.disconnect());
  }
  /**
   * Destroy the provider. This method clears the document, awareness, and window/process listeners and disconnects the socket.
   * @type {() => void}
   */
  destroy() {
    this.resyncInterval != null && clearInterval(this.resyncInterval), this.disconnect(), typeof window != "undefined" ? window.removeEventListener("beforeunload", this.beforeUnloadHandler) : typeof process != "undefined" && process.off("exit", this.beforeUnloadHandler), this.awareness.off("update", this.awarenessUpdate), this.doc.off("update", this.onUpdateDoc), super.destroy();
  }
};
export {
  d as SocketIOProvider
};
//# sourceMappingURL=index.mjs.map
// src/server/document.ts
import * as d from "yjs";
import * as l from "y-protocols/awareness";
var w = process.env.GC !== "false" && process.env.GC !== "0", c = class extends d.Doc {
  /**
   * Document constructor.
   * @constructor
   * @param {string} name Name for the document
   * @param {Namespace} namespace The namespace connection
   * @param {Callbacks} callbacks The document callbacks
   */
  constructor(t, e, s) {
    super({ gc: w });
    /**
     * Handles the document's update and emit eht changes to clients.
     * @type {(update: Uint8Array) => void}
     * @param {Uint8Array} update
     * @private
     */
    this.onUpdateDoc = (t) => {
      var e;
      if (((e = this.callbacks) == null ? void 0 : e.onUpdate) != null)
        try {
          this.callbacks.onUpdate(this, t);
        } catch (s) {
          console.warn(s);
        }
      this.namespace.emit("sync-update", t);
    };
    /**
     * Handles the awareness update and emit the changes to clients.
     * @type {({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, _socket: Socket | null) => void}
     * @param {AwarenessChange} awarenessChange
     * @param {Socket | null} _socket
     * @private
     */
    this.onUpdateAwareness = ({ added: t, updated: e, removed: s }, n) => {
      var o;
      let r = t.concat(e, s), a = l.encodeAwarenessUpdate(this.awareness, r);
      if (((o = this.callbacks) == null ? void 0 : o.onChangeAwareness) != null)
        try {
          this.callbacks.onChangeAwareness(this, a);
        } catch (y) {
          console.warn(y);
        }
      this.namespace.emit("awareness-update", a);
    };
    this.name = t, this.namespace = e, this.awareness = new l.Awareness(this), this.awareness.setLocalState(null), this.callbacks = s, this.awareness.on("update", this.onUpdateAwareness), this.on("update", this.onUpdateDoc);
  }
  /**
   * Destroy the document and remove the listeners.
   * @type {() => Promise<void>}
   */
  async destroy() {
    var t;
    if (((t = this.callbacks) == null ? void 0 : t.onDestroy) != null)
      try {
        await this.callbacks.onDestroy(this);
      } catch (e) {
        console.warn(e);
      }
    this.awareness.off("update", this.onUpdateAwareness), this.off("update", this.onUpdateDoc), this.namespace.disconnectSockets(), super.destroy();
  }
};

// src/server/y-socket-io.ts
import * as i from "yjs";
import * as p from "y-protocols/awareness";
import { LeveldbPersistence as v } from "y-leveldb";
import { Observable as A } from "lib0/observable";
var u = class extends A {
  /**
   * YSocketIO constructor.
   * @constructor
   * @param {Server} io Server instance from Socket IO
   * @param {YSocketIOConfiguration} configuration (Optional) The YSocketIO configuration
   */
  constructor(t, e) {
    var s;
    super();
    /**
     * @type {Map<string, Document>}
     */
    this._documents = /* @__PURE__ */ new Map();
    /**
     * @type {string | undefined | null}
     */
    this._levelPersistenceDir = null;
    /**
     * @type {Persistence | null}
     */
    this.persistence = null;
    /**
     * This function initializes the socket event listeners to synchronize document changes.
     *
     *  The synchronization protocol is as follows:
     *  - A client emits the sync step one event (`sync-step-1`) which sends the document as a state vector
     *    and the sync step two callback as an acknowledgment according to the socket io acknowledgments.
     *  - When the server receives the `sync-step-1` event, it executes the `syncStep2` acknowledgment callback and sends
     *    the difference between the received state vector and the local document (this difference is called an update).
     *  - The second step of the sync is to apply the update sent in the `syncStep2` callback parameters from the server
     *    to the document on the client side.
     *  - There is another event (`sync-update`) that is emitted from the client, which sends an update for the document,
     *    and when the server receives this event, it applies the received update to the local document.
     *  - When an update is applied to a document, it will fire the document's "update" event, which
     *    sends the update to clients connected to the document's namespace.
     * @private
     * @type {(socket: Socket, doc: Document) => void}
     * @param {Socket} socket The socket connection
     * @param {Document} doc The document
     */
    this.initSyncListeners = (t, e) => {
      t.on("sync-step-1", (s, n) => {
        n(i.encodeStateAsUpdate(e, new Uint8Array(s)));
      }), t.on("sync-update", (s) => {
        i.applyUpdate(e, s, null);
      });
    };
    /**
     * This function initializes socket event listeners to synchronize awareness changes.
     *
     *  The awareness protocol is as follows:
     *  - A client emits the `awareness-update` event by sending the awareness update.
     *  - The server receives that event and applies the received update to the local awareness.
     *  - When an update is applied to awareness, the awareness "update" event will fire, which
     *    sends the update to clients connected to the document namespace.
     * @private
     * @type {(socket: Socket, doc: Document) => void}
     * @param {Socket} socket The socket connection
     * @param {Document} doc The document
     */
    this.initAwarenessListeners = (t, e) => {
      t.on("awareness-update", (s) => {
        p.applyAwarenessUpdate(e.awareness, new Uint8Array(s), t);
      });
    };
    /**
     *  This function initializes socket event listeners for general purposes.
     *
     *  When a client has been disconnected, check the clients connected to the document namespace,
     *  if no connection remains, emit the `all-document-connections-closed` event
     *  parameters and if LevelDB persistence is enabled, persist the document in LevelDB and destroys it.
     * @private
     * @type {(socket: Socket, doc: Document) => void}
     * @param {Socket} socket The socket connection
     * @param {Document} doc The document
     */
    this.initSocketListeners = (t, e) => {
      t.on("disconnect", async () => {
        (await t.nsp.allSockets()).size === 0 && (this.emit("all-document-connections-closed", [e]), this.persistence != null && (await this.persistence.writeState(e.name, e), await e.destroy()));
      });
    };
    /**
     * This function is called when a client connects and it emit the `sync-step-1` and `awareness-update`
     * events to the client to start the sync.
     * @private
     * @type {(socket: Socket, doc: Document) => void}
     * @param {Socket} socket The socket connection
     * @param {Document} doc The document
     */
    this.startSynchronization = (t, e) => {
      t.emit("sync-step-1", i.encodeStateVector(e), (s) => {
        i.applyUpdate(e, new Uint8Array(s), this);
      }), t.emit("awareness-update", p.encodeAwarenessUpdate(e.awareness, Array.from(e.awareness.getStates().keys())));
    };
    this.io = t, this._levelPersistenceDir = (s = e == null ? void 0 : e.levelPersistenceDir) != null ? s : process.env.YPERSISTENCE, this._levelPersistenceDir != null && this.initLevelDB(this._levelPersistenceDir), this.configuration = e;
  }
  /**
   * YSocketIO initialization.
   *
   *  This method set ups a dynamic namespace manager for namespaces that match with the regular expression `/^\/yjs\|.*$/`
   *  and adds the connection authentication middleware to the dynamics namespaces.
   *
   *  It also starts socket connection listeners.
   * @type {() => void}
   */
  initialize() {
    let t = this.io.of(/^\/yjs\|.*$/);
    t.use(async (e, s) => {
      var n;
      return ((n = this.configuration) == null ? void 0 : n.authenticate) == null || await this.configuration.authenticate(e.handshake) ? s() : s(new Error("Unauthorized"));
    }), t.on("connection", async (e) => {
      var r;
      let s = e.nsp.name.replace(/\/yjs\|/, ""), n = await this.initDocument(s, e.nsp, (r = this.configuration) == null ? void 0 : r.gcEnabled);
      this.initSyncListeners(e, n), this.initAwarenessListeners(e, n), this.initSocketListeners(e, n), this.startSynchronization(e, n);
    });
  }
  /**
   * The document map's getter. If you want to delete a document externally, make sure you don't delete
   * the document directly from the map, instead use the "destroy" method of the document you want to delete,
   * this way when you destroy the document you are also closing any existing connection on the document.
   * @type {Map<string, Document>}
   */
  get documents() {
    return this._documents;
  }
  /**
   * This method creates a yjs document if it doesn't exist in the document map. If the document exists, get the map document.
   *
   *  - If document is created:
   *      - Binds the document to LevelDB if LevelDB persistence is enabled.
   *      - Adds the new document to the documents map.
   *      - Emit the `document-loaded` event
   * @private
   * @param {string} name The name for the document
   * @param {Namespace} namespace The namespace of the document
   * @param {boolean} gc Enable/Disable garbage collection (default: gc=true)
   * @returns {Promise<Document>} The document
   */
  async initDocument(t, e, s = !0) {
    var r;
    let n = (r = this._documents.get(t)) != null ? r : new c(t, e, {
      onUpdate: (a, o) => this.emit("document-update", [a, o]),
      onChangeAwareness: (a, o) => this.emit("awareness-update", [a, o]),
      onDestroy: async (a) => {
        this._documents.delete(a.name), this.emit("document-destroy", [a]);
      }
    });
    return n.gc = s, this._documents.has(t) || (this.persistence != null && await this.persistence.bindState(t, n), this._documents.set(t, n), this.emit("document-loaded", [n])), n;
  }
  /**
   * This method sets persistence if enabled.
   * @private
   * @param {string} levelPersistenceDir The directory path where the persistent Level database is stored
   */
  initLevelDB(t) {
    let e = new v(t);
    this.persistence = {
      provider: e,
      bindState: async (s, n) => {
        let r = await e.getYDoc(s), a = i.encodeStateAsUpdate(n);
        await e.storeUpdate(s, a), i.applyUpdate(n, i.encodeStateAsUpdate(r)), n.on("update", async (o) => await e.storeUpdate(s, o));
      },
      writeState: async (s, n) => {
      }
    };
  }
};

export {
  c as a,
  u as b
};
//# sourceMappingURL=chunk-YXKT54OX.mjs.map
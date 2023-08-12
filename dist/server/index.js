"use strict";
var g = Object.create;
var d = Object.defineProperty;
var D = Object.getOwnPropertyDescriptor;
var S = Object.getOwnPropertyNames;
var b = Object.getPrototypeOf, P = Object.prototype.hasOwnProperty;
var k = (a, r) => {
  for (var t in r)
    d(a, t, { get: r[t], enumerable: !0 });
}, w = (a, r, t, e) => {
  if (r && typeof r == "object" || typeof r == "function")
    for (let s of S(r))
      !P.call(a, s) && s !== t && d(a, s, { get: () => r[s], enumerable: !(e = D(r, s)) || e.enumerable });
  return a;
};
var u = (a, r, t) => (t = a != null ? g(b(a)) : {}, w(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  r || !a || !a.__esModule ? d(t, "default", { value: a, enumerable: !0 }) : t,
  a
)), C = (a) => w(d({}, "__esModule", { value: !0 }), a);

// src/server/index.ts
var _ = {};
k(_, {
  Document: () => p,
  YSocketIO: () => y
});
module.exports = C(_);

// src/server/document.ts
var v = u(require("yjs")), m = u(require("y-protocols/awareness")), Y = process.env.GC !== "false" && process.env.GC !== "0", p = class extends v.Doc {
  /**
   * Document constructor.
   * @constructor
   * @param {string} name Name for the document
   * @param {Namespace} namespace The namespace connection
   * @param {Callbacks} callbacks The document callbacks
   */
  constructor(t, e, s) {
    super({ gc: Y });
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
      var l;
      let c = t.concat(e, s), i = m.encodeAwarenessUpdate(this.awareness, c);
      if (((l = this.callbacks) == null ? void 0 : l.onChangeAwareness) != null)
        try {
          this.callbacks.onChangeAwareness(this, i);
        } catch (U) {
          console.warn(U);
        }
      this.namespace.emit("awareness-update", i);
    };
    this.name = t, this.namespace = e, this.awareness = new m.Awareness(this), this.awareness.setLocalState(null), this.callbacks = s, this.awareness.on("update", this.onUpdateAwareness), this.on("update", this.onUpdateDoc);
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
var o = u(require("yjs")), h = u(require("y-protocols/awareness")), A = require("y-leveldb");
var f = require("lib0/observable"), y = class extends f.Observable {
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
        n(o.encodeStateAsUpdate(e, new Uint8Array(s)));
      }), t.on("sync-update", (s) => {
        o.applyUpdate(e, s, null);
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
        h.applyAwarenessUpdate(e.awareness, new Uint8Array(s), t);
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
      t.emit("sync-step-1", o.encodeStateVector(e), (s) => {
        o.applyUpdate(e, new Uint8Array(s), this);
      }), t.emit("awareness-update", h.encodeAwarenessUpdate(e.awareness, Array.from(e.awareness.getStates().keys())));
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
      var c;
      let s = e.nsp.name.replace(/\/yjs\|/, ""), n = await this.initDocument(s, e.nsp, (c = this.configuration) == null ? void 0 : c.gcEnabled);
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
    var c;
    let n = (c = this._documents.get(t)) != null ? c : new p(t, e, {
      onUpdate: (i, l) => this.emit("document-update", [i, l]),
      onChangeAwareness: (i, l) => this.emit("awareness-update", [i, l]),
      onDestroy: async (i) => {
        this._documents.delete(i.name), this.emit("document-destroy", [i]);
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
    let e = new A.LeveldbPersistence(t);
    this.persistence = {
      provider: e,
      bindState: async (s, n) => {
        let c = await e.getYDoc(s), i = o.encodeStateAsUpdate(n);
        await e.storeUpdate(s, i), o.applyUpdate(n, o.encodeStateAsUpdate(c)), n.on("update", async (l) => await e.storeUpdate(s, l));
      },
      writeState: async (s, n) => {
      }
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Document,
  YSocketIO
});
//# sourceMappingURL=index.js.map
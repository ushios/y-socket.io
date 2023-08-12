#!/usr/bin/env node
import {
  b as e
} from "../chunk-YXKT54OX.mjs";

// src/server/server.ts
import p from "http";
import { Server as d } from "socket.io";
var i, l = (i = process.env.HOST) != null ? i : "localhost", r, t = parseInt(`${(r = process.env.PORT) != null ? r : 1234}`), c = p.createServer((o, n) => {
  n.writeHead(200, { "Content-Type": "application/json" }), n.end(JSON.stringify({ ok: !0 }));
}), s = new d(c), S = new e(s, {
  // authenticate: (handshake) => handshake.auth.token === 'valid-token',
  // OR
  // authenticate: (handshake) => {
  //   return new Promise<boolean>(resolve => {
  //     setTimeout(() => resolve(handshake.auth.token === 'valid-token'), 2000)
  //   })
  // },
  // levelPersistenceDir: './storage-location',
  // gcEnabled: true,
});
S.initialize();
s.on("connection", (o) => {
  console.log(`[connection] Connected with user: ${o.id}`), o.on("disconnect", () => {
    console.log(`[disconnect] Disconnected with user: ${o.id}`);
  });
});
c.listen(t, l, void 0, () => console.log(`Server running on port ${t}`));
//# sourceMappingURL=server.mjs.map
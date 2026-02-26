import { DurableObject } from "cloudflare:workers";
import { createPeer } from "psionic";
import { createWebSocketAdapter } from "psionic/adapters/websocket";
import type { ClientAPI } from "../src/api";
import type { CFWorkerAPI, PeerType } from "./peer";
import { handlePeer } from "./peer";
import { createSession } from "psionic/session";

type SessionState = {
	peer: PeerType,
	disconnectTimer?: number;
	ws?: WebSocket;
};

export class Psionic extends DurableObject {
	private sessions = new Map<string, SessionState>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname !== "/websocket") {
			return new Response("Not found", { status: 404 });
		}

		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
			return new Response("Expected Upgrade: websocket", { status: 426 });
		}
		if (request.method !== "GET") {
			return new Response("Expected GET", { status: 400 });
		}

		// Session identity: ensures reconnect attaches to same peer state.
		const sid = url.searchParams.get("sid") || crypto.randomUUID();

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		//this.ctx.acceptWebSocket(server);
		server.accept();

		// Get/create session state
		let sess = this.sessions.get(sid);
		if (!sess) {
			sess = {
				peer: createPeer<ClientAPI, CFWorkerAPI>({ session: createSession() }),
			};
			this.sessions.set(sid, sess);
			console.log('starting session', sid);
		} else {
			console.log('reusing session', sid);
		}

		const peer = sess.peer;

		// If there was a pending soft-disconnect cleanup, cancel it.
		if (sess.disconnectTimer) {
			clearTimeout(sess.disconnectTimer);
			sess.disconnectTimer = undefined;
		}

		// If there was an existing ws, you can decide policy:
		// - close old one and replace (common)
		// - reject new connection
		if (sess.ws) {
			try {
				sess.ws.close(1000, "Replaced by new connection");
			} catch { }
		}
		sess.ws = server;

        const adapter = createWebSocketAdapter(server as any);

		server.addEventListener("close", () => {
			console.log(new Date(), 'peer closed ', sid);

			// Soft-disconnect: keep peer/inflight/generators alive briefly to survive hiccups.
			// If client reconnects within the window, everything continues.
			const GRACE_MS = 15_000;

			// Avoid scheduling multiple timers for the same session
			if (!sess) return;
			if (sess.disconnectTimer) {
                clearTimeout(sess.disconnectTimer);
            }

			sess.disconnectTimer = setTimeout(() => {
				// Hard cleanup after grace window
				try {
					peer.close();
				} catch { }
				console.log(new Date(), 'peer cleanup ', sid);
				this.sessions.delete(sid);
			}, GRACE_MS) as unknown as number;
		});

		// Attach peer to this remote (does describe/ready sequencing)
		peer.connect(adapter).then(() => {
			return handlePeer(sid, peer);
		}).catch((err: any) => {
			console.error(new Date(), "Failed to attach peer:", err);
			try {
				server.close(3000, "Peer attach failed");
			} catch { }
		})

		// set SID cookie for client to use in future connections (optional, depends on your SID strategy)
		return new Response(null, { status: 101, webSocket: client });
	}
}

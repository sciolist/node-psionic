import { env } from "cloudflare:workers";
export { Psionic } from "./cloudflare";

export default {
  fetch(request) {
    const url = new URL(request.url);

		if (url.pathname === "/websocket") {
			const sid = url.searchParams.get("sid") ?? "global";
			const id = env.PSIONIC.idFromName(sid);
			const stub = env.PSIONIC.get(id);
			return stub.fetch(request);
		}

		return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

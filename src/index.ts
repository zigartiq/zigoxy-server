import * as http from "http";
import { WebSocket, WebSocketServer } from "ws";
import httpProxy from "http-proxy";
import { Handler } from "@netlify/functions";

interface Tunnel {
    ws: WebSocket;
    targetPort: number;
    lastActive: number;
}

// subdomain -> tunnel
const tunnels: Map<string, Tunnel> = new Map();

const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const host = req.headers.host || "";
    const subdomain = host.split(".")[0];

    const tunnel = tunnels.get(subdomain);

    if (!tunnel) {
        res.statusCode = 404;
        res.end("Tunnel not found");
        return;
    }

    tunnel.lastActive = Date.now();

    const proxy = httpProxy.createProxyServer({});

    proxy.web(
        req,
        res,
        {
            target: `http://localhost:${tunnel.targetPort}`,
            ws: req.headers.upgrade === "websocket",
        },
        (err: Error) => {
            if (err) {
                res.statusCode = 502;
                res.end("Bad Gateway");
            }
        }
    );
};

const server = http.createServer(handleRequest);

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const port = parseInt(url.searchParams.get("port") || "8080");

    const { customAlphabet } = await import("nanoid");
    const subdomain = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 5)();

    tunnels.set(subdomain, {
        ws,
        targetPort: port,
        lastActive: Date.now(),
    });

    ws.send(JSON.stringify({ subdomain }));

    ws.on("close", () => {
        tunnels.delete(subdomain);
    });
});

export const handler: Handler = async (event, context) => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: "Missing request body",
        };
    }

    const req = new http.IncomingMessage(null as any);
    Object.assign(req, {
        method: event.httpMethod,
        headers: event.headers,
        url: event.path,
    });

    const res = new http.ServerResponse(req);

    await handleRequest(req, res);

    const headers = Object.entries(res.getHeaders()).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = Array.isArray(value) ? value[0] : value;
        }
        return acc;
    }, {} as { [key: string]: string | number | boolean });

    return {
        statusCode: res.statusCode,
        body: res.statusMessage || "",
        headers,
    };
};

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Development server running on http://localhost:${PORT}`);
    console.log("For testing, use subdomains like: http://<subdomain>.localhost:3000");
});

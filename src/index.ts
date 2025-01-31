import * as http from "http";
import { WebSocket, WebSocketServer } from "ws";
import httpProxy from "http-proxy";
import * as crypto from "crypto";

interface Tunnel {
    ws: WebSocket;
    targetHost: string;
    targetPort: number;
    lastActive: number;
}

// subdomain -> tunnel
const tunnels: Map<string, Tunnel> = new Map();

const generateId = (length: number): string => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += chars[randomBytes[i] % chars.length];
    }
    return result;
};

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
            target: `http://${tunnel.targetHost}:${tunnel.targetPort}`,
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
    const subdomain = generateId(5);

    const clientIp = (req.headers["x-forwarded-for"] as string) || "unknown";

    tunnels.set(subdomain, {
        ws,
        targetPort: port,
        targetHost: clientIp,
        lastActive: Date.now(),
    });

    ws.send(JSON.stringify({ subdomain }));

    ws.on("close", () => {
        tunnels.delete(subdomain);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Development server running on http://localhost:${PORT}`);
    console.log("For testing, use subdomains like: http://<subdomain>.localhost:3000");
});

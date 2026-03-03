import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("gola_orders.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token INTEGER NOT NULL,
    items TEXT NOT NULL,
    totalPrice REAL NOT NULL,
    isParcel BOOLEAN NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/orders", (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY createdAt DESC").all();
    res.json(orders);
  });

  app.post("/api/orders", (req, res) => {
    const { items, totalPrice, isParcel } = req.body;
    
    // Generate token (simple increment for the day, or just use ID for now)
    const lastOrder = db.prepare("SELECT token FROM orders ORDER BY id DESC LIMIT 1").get() as { token: number } | undefined;
    const nextToken = (lastOrder?.token || 0) + 1;

    const info = db.prepare(
      "INSERT INTO orders (token, items, totalPrice, isParcel, status) VALUES (?, ?, ?, ?, ?)"
    ).run(nextToken, JSON.stringify(items), totalPrice, isParcel ? 1 : 0, 'PENDING');

    const newOrder = {
      id: info.lastInsertRowid,
      token: nextToken,
      items: JSON.stringify(items),
      totalPrice,
      isParcel,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    // Broadcast to all connected admins
    broadcast({ type: 'NEW_ORDER', order: newOrder });

    res.json(newOrder);
  });

  app.patch("/api/orders/:id", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    
    const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get();
    broadcast({ type: 'UPDATE_ORDER', order: updatedOrder });
    
    res.json(updatedOrder);
  });

  // WebSocket Setup
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
}

startServer();

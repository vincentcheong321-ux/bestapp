import express from "express";
import { createServer as createViteServer } from "vite";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { createClient } from "@supabase/supabase-js";

console.log("SERVER INITIALIZING...");

// Hardcoded Supabase credentials
const SUPABASE_URL = "https://zxxlkolwjtsnvlunpxpd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4eGxrb2x3anRzbnZsdW5weHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTAyMzksImV4cCI6MjA4ODcyNjIzOX0.cwFCMUWiaFV2xm2Diab2h17ZQd5wNuqPZ1TMQ8hDYQU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function startServer() {
  console.log("STARTING SERVER...");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  const api = express.Router();

  api.get("/test", (req, res) => {
    console.log("API TEST HIT");
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  api.get("/resources", async (req, res) => {
    console.log("GET RESOURCES HIT");
    try {
      const { data, error } = await supabase
        .from('target_resources')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        if (error.code === '42P01') return res.json([]);
        throw error;
      }
      res.json(data || []);
    } catch (error: any) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: error.message });
    }
  });

  api.post("/resources", async (req, res) => {
    console.log("POST RESOURCES HIT", req.body);
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: "Missing fields" });

    try {
      const { data, error } = await supabase
        .from('target_resources')
        .insert([{ name, url }])
        .select();
      if (error) throw error;
      res.json(data[0]);
    } catch (error: any) {
      console.error("Error adding resource:", error);
      res.status(500).json({ error: error.message });
    }
  });

  api.delete("/resources", async (req, res) => {
    console.log("DELETE RESOURCES HIT", req.body);
    const { url } = req.body;
    try {
      const { error } = await supabase
        .from('target_resources')
        .delete()
        .eq('url', url);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: error.message });
    }
  });

  api.post("/generate", async (req, res) => {
    console.log("GENERATE HIT", req.body);
    const { targetUrl, durationMinutes } = req.body;
    if (!targetUrl || !durationMinutes) return res.status(400).json({ error: "Missing fields" });

    const token = uuidv4().slice(0, 8);
    const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();

    try {
      const { error } = await supabase
        .from('expiring_links')
        .insert([{ token, target_url: targetUrl, expires_at: expiresAt }]);
      if (error) throw error;

      let appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      if (appUrl.includes('ais-dev-')) appUrl = appUrl.replace('ais-dev-', 'ais-pre-');
      
      res.json({ expiringUrl: `${appUrl}/r/${token}`, expiresAt, token });
    } catch (error: any) {
      console.error("Generate error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use("/api", api);

  // Redirect handler
  app.get("/r/:token", async (req, res) => {
    const { token } = req.params;
    console.log("REDIRECT HIT", token);

    try {
      const { data: link, error } = await supabase
        .from('expiring_links')
        .select('target_url, expires_at')
        .eq('token', token)
        .single();
      
      if (error || !link) {
        return res.status(404).send("Link not found");
      }

      if (new Date() > new Date(link.expires_at)) {
        return res.status(410).send("Link expired");
      }

      res.send(`
        <html>
          <head><meta http-equiv="refresh" content="1; url=${link.target_url}"></head>
          <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh;">
            <div style="text-align: center;">
              <h2>Redirecting...</h2>
              <p>Taking you to your destination.</p>
              <a href="${link.target_url}">Click here if not redirected</a>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send("Server error");
    }
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`SERVER LISTENING ON PORT ${PORT}`);
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    console.log("INITIALIZING VITE MIDDLEWARE...");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("VITE MIDDLEWARE READY");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
}

startServer().catch(err => {
  console.error("FATAL SERVER ERROR", err);
});

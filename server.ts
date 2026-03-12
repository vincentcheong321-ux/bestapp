import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { sql } from "@vercel/postgres";
import { createClient } from "@supabase/supabase-js";

// Hardcoded Supabase credentials (WARNING: Security risk)
const SUPABASE_URL = "https://zxxlkolwjtsnvlunpxpd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4eGxrb2x3anRzbnZsdW5weHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTAyMzksImV4cCI6MjA4ODcyNjIzOX0.cwFCMUWiaFV2xm2Diab2h17ZQd5wNuqPZ1TMQ8hDYQU";

const isSupabase = true;
const isVercelPostgres = false;
const isVercel = !!process.env.VERCEL;

const db = null;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize database
async function initDb() {
  if (isSupabase && supabase) {
    console.log("Supabase client initialized.");
    console.log("Ensure the following tables exist in your Supabase project:");
    console.log(`
      CREATE TABLE IF NOT EXISTS expiring_links (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        target_url TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS target_resources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else if (isVercelPostgres) {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS expiring_links (
          id SERIAL PRIMARY KEY,
          token TEXT UNIQUE NOT NULL,
          target_url TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      console.log("Postgres database initialized");
    } catch (error) {
      console.error("Postgres initialization error:", error);
    }
  } else if (db) {
    (db as any).exec(`
      CREATE TABLE IF NOT EXISTS expiring_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        target_url TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("SQLite database initialized");
  }
}

async function startServer() {
  await initDb();

  const app = express();
  const PORT = 3000;

app.use(express.json());

// API: Manage target resources
app.get("/api/resources", async (req, res) => {
  try {
    if (isSupabase && supabase) {
      const { data, error } = await supabase
        .from('target_resources')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        // If table doesn't exist, return default hardcoded ones
        if (error.code === '42P01') return res.json([]);
        throw error;
      }
      res.json(data);
    } else {
      res.json([]); // Fallback for non-supabase
    }
  } catch (error) {
    console.error("Error fetching resources:", error);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

app.post("/api/resources", async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: "Missing fields" });

  try {
    if (isSupabase && supabase) {
      const { data, error } = await supabase
        .from('target_resources')
        .insert([{ name, url }])
        .select();
      if (error) throw error;
      res.json(data[0]);
    } else {
      res.status(501).json({ error: "Not implemented for this provider" });
    }
  } catch (error) {
    console.error("Error adding resource:", error);
    res.status(500).json({ error: "Failed to add resource" });
  }
});

app.delete("/api/resources", async (req, res) => {
  const { url } = req.body;
  try {
    if (isSupabase && supabase) {
      const { error } = await supabase
        .from('target_resources')
        .delete()
        .eq('url', url);
      if (error) throw error;
      res.json({ success: true });
    } else {
      res.status(501).json({ error: "Not implemented" });
    }
  } catch (error) {
    console.error("Error deleting resource:", error);
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

// API: Generate expiring link
app.post("/api/generate", async (req, res) => {
  const { targetUrl, durationMinutes } = req.body;

    if (!targetUrl || !durationMinutes) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const token = uuidv4().slice(0, 8); // Short token
    const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();

    try {
      if (isSupabase && supabase) {
        const { error } = await supabase
          .from('expiring_links')
          .insert([
            { token, target_url: targetUrl, expires_at: expiresAt }
          ]);
        if (error) throw error;
      } else if (isVercel) {
        await sql`
          INSERT INTO expiring_links (token, target_url, expires_at)
          VALUES (${token}, ${targetUrl}, ${expiresAt})
        `;
      } else if (db) {
        const stmt = db.prepare(
          "INSERT INTO expiring_links (token, target_url, expires_at) VALUES (?, ?, ?)"
        );
        stmt.run(token, targetUrl, expiresAt);
      }

      let appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      
      // Automatically convert dev URL to shared/pre URL for public links
      if (appUrl.includes('ais-dev-')) {
        appUrl = appUrl.replace('ais-dev-', 'ais-pre-');
      }

      const expiringUrl = `${appUrl}/r/${token}`;

      res.json({ expiringUrl, expiresAt, token });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ error: "Failed to generate link" });
    }
  });

  // Redirect handler
  app.get("/r/:token", async (req, res) => {
    const { token } = req.params;
    console.log(`[Redirect] Accessing token: ${token}`);

    let link: { target_url: string; expires_at: string } | undefined;

    try {
      if (isSupabase && supabase) {
        const { data, error } = await supabase
          .from('expiring_links')
          .select('target_url, expires_at')
          .eq('token', token)
          .single();
        
        if (data) {
          link = {
            target_url: data.target_url,
            expires_at: data.expires_at
          };
        }
      } else if (isVercel) {
        const { rows } = await sql`
          SELECT target_url, expires_at FROM expiring_links WHERE token = ${token}
        `;
        if (rows.length > 0) {
          link = {
            target_url: rows[0].target_url,
            expires_at: rows[0].expires_at.toISOString ? rows[0].expires_at.toISOString() : rows[0].expires_at
          };
        }
      } else if (db) {
        const stmt = db.prepare(
          "SELECT target_url, expires_at FROM expiring_links WHERE token = ?"
        );
        link = stmt.get(token) as { target_url: string; expires_at: string } | undefined;
      }
    } catch (error) {
      console.error("Database query error:", error);
    }

    if (!link) {
      console.log(`[Redirect] Token not found: ${token}`);
      return res.status(404).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>404 - Link Not Found</h1>
          <p>The link you are looking for does not exist or has been removed.</p>
          <a href="/" style="color: #0066cc; text-decoration: none;">Go to LinkVault Home</a>
        </div>
      `);
    }

    const now = new Date();
    const expiresAt = new Date(link.expires_at);

    if (now > expiresAt) {
      return res.status(410).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>Link Expired</h1>
          <p>This secure link expired on ${expiresAt.toLocaleString()}.</p>
        </div>
      `);
    }

    // Use client-side redirect to be more compatible with auth proxies/bridges
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Downloading | LinkVault</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="refresh" content="2; url=${link.target_url}">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              background: #f9f9f9; 
              color: #1a1a1a;
            }
            .card { 
              background: white; 
              padding: 2.5rem; 
              border-radius: 1.5rem; 
              box-shadow: 0 10px 25px rgba(0,0,0,0.05); 
              text-align: center;
              max-width: 400px;
              width: 90%;
            }
            .spinner {
              width: 40px;
              height: 40px;
              border: 3px solid #f3f3f3;
              border-top: 3px solid #1a1a1a;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto 1.5rem;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            h2 { margin: 0 0 0.5rem; font-weight: 600; font-size: 1.25rem; }
            p { color: #666; font-size: 0.9rem; line-height: 1.5; }
            a { color: #0066cc; text-decoration: none; font-weight: 500; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2>Downloading...</h2>
            <p>We're taking you to your secure destination.</p>
            <p style="margin-top: 1.5rem; border-top: 1px solid #eee; pt: 1rem; font-size: 0.75rem;">
              If the download does not start automatically, <a href="${link.target_url}">click here</a>.
            </p>
          </div>
          <script>
            // Immediate redirect attempt
            setTimeout(() => {
              window.location.href = "${link.target_url}";
            }, 500);
          </script>
        </body>
      </html>
    `);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

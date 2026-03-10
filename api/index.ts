import express from "express";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { sql } from "@vercel/postgres";
import { createClient } from "@supabase/supabase-js";

const isSupabase = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY;
const isVercel = !!process.env.POSTGRES_URL && !isSupabase;

const db = (!isVercel && !isSupabase) ? new Database("links.db") : null;
const supabase = isSupabase ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!) : null;

const app = express();
app.use(express.json());

// Initialize database
async function initDb() {
  console.log("Debug: isSupabase =", isSupabase, "isVercel =", isVercel);
  console.log("Debug: SUPABASE_URL =", !!process.env.SUPABASE_URL, "SUPABASE_KEY =", !!process.env.SUPABASE_KEY);
  console.log("Debug: POSTGRES_URL =", !!process.env.POSTGRES_URL);

  if (isSupabase && supabase) {
    console.log("Supabase client initialized.");
  } else if (isVercel) {
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
    db.exec(`
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

// API: Generate expiring link
app.post("/api/generate", async (req, res) => {
  console.log("Request body:", req.body);
  await initDb();
  const { targetUrl, durationMinutes } = req.body;

  if (!targetUrl || !durationMinutes) {
    console.log("Missing required fields");
    return res.status(400).json({ error: "Missing required fields" });
  }

  const token = uuidv4().slice(0, 8);
  const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
  console.log("Generated token:", token, "Expires at:", expiresAt);

  try {
    if (isSupabase && supabase) {
      console.log("Attempting Supabase insert");
      const { error } = await supabase
        .from('expiring_links')
        .insert([{ token, target_url: targetUrl, expires_at: expiresAt }]);
      if (error) throw error;
      console.log("Supabase insert successful");
    } else if (isVercel) {
      console.log("Attempting Postgres insert");
      await sql`
        INSERT INTO expiring_links (token, target_url, expires_at)
        VALUES (${token}, ${targetUrl}, ${expiresAt})
      `;
      console.log("Postgres insert successful");
    } else if (db) {
      console.log("Attempting SQLite insert");
      const stmt = db.prepare(
        "INSERT INTO expiring_links (token, target_url, expires_at) VALUES (?, ?, ?)"
      );
      stmt.run(token, targetUrl, expiresAt);
      console.log("SQLite insert successful");
    }

    let appUrl = process.env.APP_URL || "https://bestapp-phi.vercel.app";
    const expiringUrl = `${appUrl}/r/${token}`;
    console.log("Returning success:", { expiringUrl, expiresAt, token });
    res.json({ expiringUrl, expiresAt, token });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to generate link", details: error instanceof Error ? error.message : String(error) });
  }
});

// API: Redirect
app.get("/r/:token", async (req, res) => {
  await initDb();
  const { token } = req.params;
  let link;

  try {
    if (isSupabase && supabase) {
      const { data, error } = await supabase
        .from('expiring_links')
        .select('*')
        .eq('token', token)
        .single();
      if (error) throw error;
      link = data;
    } else if (isVercel) {
      const { rows } = await sql`SELECT * FROM expiring_links WHERE token = ${token}`;
      link = rows[0];
    } else if (db) {
      link = db.prepare("SELECT * FROM expiring_links WHERE token = ?").get(token);
    }

    if (!link || new Date(link.expires_at) < new Date()) {
      return res.status(404).send("Link expired or not found");
    }

    res.send(`
      <html>
        <head>
          <title>Redirecting...</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { text-align: center; padding: 2rem; border: 1px solid #eee; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .spinner { width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #1a1a1a; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2>Redirecting...</h2>
            <p>If you are not redirected automatically, <a href="${link.target_url}">click here</a>.</p>
          </div>
          <script>
            setTimeout(() => { window.location.href = "${link.target_url}"; }, 500);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send("Error processing redirect");
  }
});

export default app;
